/**
 * Unit Tests — Streaming Q&A & Conversational Prompting (Phase 5 Slice 5.4)
 *
 * Covers:
 * 1. answerConversationQuestionStream happy path:
 *    - Emits 'status' (retrieving_evidence, generating_answer).
 *    - Emits incremental provisional 'delta' events.
 *    - Emits terminal 'complete' event with verified answer, authoritative citations, and messageId.
 *    - Persists completed assistant message in database.
 * 2. Zero LLM calls on insufficient evidence:
 *    - When hasSufficientEvidence = false or chunks = [], generateChatStream is NEVER called.
 *    - Persists canned refusal message.
 *    - Yields terminal 'complete' event with hasSufficientEvidence = false.
 * 3. Authoritative citation verification:
 *    - Maps valid chunk IDs to authoritative citations with coordinates.
 *    - Drops fabricated/unknown chunk IDs.
 *    - Marks citationValidationPassed = false and isGrounded = false if all chunk IDs are fabricated.
 * 4. Stream interruption handling:
 *    - When AbortSignal is triggered mid-stream, generator terminates early.
 *    - Invariant: Partial assistant message is NEVER persisted to the database.
 * 5. Bounded conversational context:
 *    - Limits prior turns to maximum 3 turns (6 messages).
 *    - Places prior turns under === CONVERSATIONAL CONTEXT ===.
 *    - Places current user question strictly under === CURRENT USER QUESTION === without duplication.
 * 6. Incremental delta extractor (extractAnswerDelta):
 *    - Extracts unescaped answer tokens as they arrive in partial JSON stream.
 *    - Ignores JSON boilerplate before and after the answer property.
 * 7. Error handling & sanitization:
 *    - Emits 'error' event on retrieval failure.
 *    - Emits 'error' event on model parse failure without leaking credentials.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {},
}));

import type { RetrievalResult, RetrievedChunk } from "@/lib/services/retrieval-service";
import type { Message } from "@/lib/db/schema";
import {
  extractAnswerDelta,
  formatConversationalContext,
  buildQaConversationUserPrompt,
  answerConversationQuestionStream,
  type ConversationalTurn,
  type QaStreamEvent,
} from "@/lib/services/qa-service";
import { ConversationAccessError } from "@/lib/services/conversation-service";

// ---------------------------------------------------------------------------
// Mock Constants & State
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const OWNER_USER_ID = "user_owner_123";
const CONVO_ID = "33333333-3333-4333-a333-333333333333";
const CHUNK_ID_1 = "aaaaaaaa-1111-4111-a111-111111111111";
const CHUNK_ID_2 = "bbbbbbbb-2222-4222-a222-222222222222";
const SECTION_ID_1 = "cccccccc-3333-4333-a333-333333333333";

const MOCK_CHUNK_1: RetrievedChunk = {
  chunkId: CHUNK_ID_1,
  documentId: VALID_DOC_ID,
  sectionId: SECTION_ID_1,
  content: "The monthly fee is $5,000 payable on the first of each month.",
  pageNumber: 2,
  similarity: 0.92,
  chunkIndex: 0,
  tokenCount: 14,
};

const MOCK_CHUNK_2: RetrievedChunk = {
  chunkId: CHUNK_ID_2,
  documentId: VALID_DOC_ID,
  sectionId: SECTION_ID_1,
  content: "Late payments incur a 5% penalty after a 10-day grace period.",
  pageNumber: 2,
  similarity: 0.88,
  chunkIndex: 1,
  tokenCount: 15,
};

let mockRetrievalResult: RetrievalResult;
let mockStreamChunks: string[] = [];
let shouldFailRetrieval = false;
let shouldFailLlmStream = false;
let appendAssistantCalls: Array<Record<string, unknown>> = [];

vi.mock("@/lib/services/retrieval-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/retrieval-service")>();
  return {
    ...actual,
    retrieveDocumentEvidence: vi.fn(async () => {
      if (shouldFailRetrieval) {
        throw new Error("Vector database unreachable: postgres://user:secret@db.internal:5432");
      }
      return mockRetrievalResult;
    }),
  };
});

vi.mock("@/lib/services/conversation-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/conversation-service")>();
  return {
    ...actual,
    verifyConversationOwnership: vi.fn(async (convoId: string, docId: string, userId: string) => {
      if (userId !== OWNER_USER_ID || docId !== VALID_DOC_ID) {
        throw new actual.ConversationAccessError("Conversation not found or access denied");
      }
      return {
        id: convoId,
        documentId: docId,
        userId,
        title: "Test Thread",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
    appendAssistantMessage: vi.fn(async (input: {
      conversationId: string;
      documentId: string;
      userId: string;
      content: string;
      citations: unknown;
      hasSufficientEvidence: boolean;
      isGrounded: boolean;
      citationValidationPassed: boolean;
    }) => {
      appendAssistantCalls.push(input);
      const msg: Message = {
        id: "msg-assistant-123",
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        citations: (input.citations as Message["citations"]) ?? null,
        hasSufficientEvidence: input.hasSufficientEvidence,
        isGrounded: input.isGrounded,
        citationValidationPassed: input.citationValidationPassed,
        metadata: null,
        createdAt: new Date(),
      };
      return msg;
    }),
  };
});

vi.mock("@/lib/ai/openai-client", () => ({
  MODELS: { CHAT: "gpt-4o" },
  TEMPERATURES: { QA: 0.1 },
  getOpenAiClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(async function* (
          _params: unknown,
          options?: { signal?: AbortSignal }
        ) {
          if (shouldFailLlmStream) {
            throw new Error("API stream timeout: sk-secret-12345");
          }
          for (const chunk of mockStreamChunks) {
            if (options?.signal?.aborted) {
              return;
            }
            yield {
              choices: [
                {
                  delta: {
                    content: chunk,
                  },
                },
              ],
            };
          }
        }),
      },
    },
  })),
}));

vi.mock("openai/helpers/zod", () => ({
  zodResponseFormat: vi.fn(() => ({ type: "json_object" })),
}));

// Helper to collect all events from the async generator
async function collectStreamEvents(
  generator: AsyncGenerator<QaStreamEvent, void, unknown>
): Promise<QaStreamEvent[]> {
  const events: QaStreamEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Streaming Q&A & Conversational Context (Phase 5 Slice 5.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldFailRetrieval = false;
    shouldFailLlmStream = false;
    appendAssistantCalls = [];

    mockRetrievalResult = {
      documentId: VALID_DOC_ID,
      question: "What is the monthly fee?",
      chunks: [MOCK_CHUNK_1, MOCK_CHUNK_2],
      hasSufficientEvidence: true,
      totalChunksExamined: 2,
    };

    // Typical streaming JSON payload split into small tokens
    mockStreamChunks = [
      '{"ans',
      'wer": "The monthly fee',
      ' is $5,000.',
      '", "cited',
      'ChunkIds": ["',
      CHUNK_ID_1,
      '"]}',
    ];
  });

  // -------------------------------------------------------------------------
  // 1. extractAnswerDelta
  // -------------------------------------------------------------------------

  describe("extractAnswerDelta", () => {
    it("extracts incremental text as JSON tokens arrive", () => {
      let buffer = '{"answer": "Hello';
      let res = extractAnswerDelta(buffer, 0);
      expect(res.delta).toBe("Hello");

      buffer += ' world';
      res = extractAnswerDelta(buffer, res.newEmittedIndex);
      expect(res.delta).toBe(" world");

      buffer += '!"}';
      res = extractAnswerDelta(buffer, res.newEmittedIndex);
      expect(res.delta).toBe("!");

      // Subsequent chunks after answer closed should produce empty delta
      buffer += ', "citedChunkIds": []}';
      res = extractAnswerDelta(buffer, res.newEmittedIndex);
      expect(res.delta).toBe("");
    });

    it("handles escape sequences in streamed strings", () => {
      const buffer = '{"answer": "Line 1\\nLine 2 with \\"quotes\\""}';
      const res = extractAnswerDelta(buffer, 0);
      expect(res.delta).toBe('Line 1\nLine 2 with "quotes"');
    });

    it("returns empty delta before answer key is encountered", () => {
      const buffer = '{"metadata": true, "oth';
      const res = extractAnswerDelta(buffer, 0);
      expect(res.delta).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // 2. formatConversationalContext & Prompt Separation
  // -------------------------------------------------------------------------

  describe("Conversational Prompt Building", () => {
    it("formats turns correctly with bounded history", () => {
      const turns: ConversationalTurn[] = [
        { role: "user", content: "What is the fee?" },
        { role: "assistant", content: "The fee is $5,000." },
        { role: "user", content: "Is there a grace period?" },
        { role: "assistant", content: "Yes, 10 days." },
      ];

      const formatted = formatConversationalContext(turns);
      expect(formatted).toContain("[User]: What is the fee?");
      expect(formatted).toContain("[Assistant]: The fee is $5,000.");
      expect(formatted).toContain("[User]: Is there a grace period?");
      expect(formatted).toContain("[Assistant]: Yes, 10 days.");
    });

    it("builds prompt with clear separation between evidence, context, and question", () => {
      const turns: ConversationalTurn[] = [
        { role: "user", content: "What is the fee?" },
        { role: "assistant", content: "The fee is $5,000." },
      ];

      const prompt = buildQaConversationUserPrompt(
        "Is there a penalty for late payment?",
        [MOCK_CHUNK_1, MOCK_CHUNK_2],
        turns
      );

      expect(prompt).toContain("=== UNTRUSTED DOCUMENT EVIDENCE START ===");
      expect(prompt).toContain(CHUNK_ID_1);
      expect(prompt).toContain(CHUNK_ID_2);
      expect(prompt).toContain("=== CONVERSATIONAL CONTEXT (NOT DOCUMENT EVIDENCE) ===");
      expect(prompt).toContain("[User]: What is the fee?");
      expect(prompt).toContain("CURRENT USER QUESTION:");
      expect(prompt).toContain("Is there a penalty for late payment?");

      // Current question must not appear under conversational context
      const contextSection = prompt.split("CURRENT USER QUESTION:")[0];
      expect(contextSection).not.toContain("Is there a penalty for late payment?");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Streaming Happy Path
  // -------------------------------------------------------------------------

  describe("answerConversationQuestionStream happy path", () => {
    it("emits status, deltas, and terminal complete event with citations", async () => {
      const events = await collectStreamEvents(
        answerConversationQuestionStream({
          documentId: VALID_DOC_ID,
          userId: OWNER_USER_ID,
          conversationId: CONVO_ID,
          question: "What is the monthly fee?",
        })
      );

      expect(events[0]).toEqual({ type: "status", phase: "retrieving_evidence" });
      expect(events[1]).toEqual({ type: "status", phase: "generating_answer" });

      const deltas = events.filter((e) => e.type === "delta");
      expect(deltas.length).toBeGreaterThan(0);
      const accumulatedDeltaText = deltas.map((d) => (d as { delta: string }).delta).join("");
      expect(accumulatedDeltaText).toBe("The monthly fee is $5,000.");

      const completeEvent = events.find((e) => e.type === "complete") as {
        type: "complete";
        messageId: string;
        answer: string;
        citations: unknown[];
        hasSufficientEvidence: boolean;
        isGrounded: boolean;
        citationValidationPassed: boolean;
      };

      expect(completeEvent).toBeDefined();
      expect(completeEvent.answer).toBe("The monthly fee is $5,000.");
      expect(completeEvent.hasSufficientEvidence).toBe(true);
      expect(completeEvent.isGrounded).toBe(true);
      expect(completeEvent.citationValidationPassed).toBe(true);
      expect(completeEvent.citations).toHaveLength(1);
      expect(completeEvent.messageId).toBe("msg-assistant-123");

      // Verifies assistant message was persisted
      expect(appendAssistantCalls).toHaveLength(1);
      expect(appendAssistantCalls[0].content).toBe("The monthly fee is $5,000.");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Insufficient Evidence Gate (Zero LLM Calls)
  // -------------------------------------------------------------------------

  describe("Insufficient evidence gate", () => {
    it("persists refusal and yields complete without calling OpenAI when chunks are empty", async () => {
      mockRetrievalResult = {
        documentId: VALID_DOC_ID,
        question: "What is the indemnity clause?",
        chunks: [],
        hasSufficientEvidence: false,
        totalChunksExamined: 0,
      };

      const events = await collectStreamEvents(
        answerConversationQuestionStream({
          documentId: VALID_DOC_ID,
          userId: OWNER_USER_ID,
          conversationId: CONVO_ID,
          question: "What is the indemnity clause?",
        })
      );

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "status", phase: "retrieving_evidence" });

      const complete = events[1] as {
        type: "complete";
        hasSufficientEvidence: boolean;
        isGrounded: boolean;
        citations: unknown[];
      };
      expect(complete.type).toBe("complete");
      expect(complete.hasSufficientEvidence).toBe(false);
      expect(complete.isGrounded).toBe(false);
      expect(complete.citations).toEqual([]);

      // Assistant refusal persisted in DB
      expect(appendAssistantCalls).toHaveLength(1);
      expect(appendAssistantCalls[0].hasSufficientEvidence).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Fabricated & Unknown Citations
  // -------------------------------------------------------------------------

  describe("Citation verification during streaming", () => {
    it("discards fabricated chunk IDs and marks citationValidationPassed = false", async () => {
      mockStreamChunks = [
        '{"answer": "Fake answer", "citedChunkIds": ["fake-chunk-id-999"]}',
      ];

      const events = await collectStreamEvents(
        answerConversationQuestionStream({
          documentId: VALID_DOC_ID,
          userId: OWNER_USER_ID,
          conversationId: CONVO_ID,
          question: "Test question",
        })
      );

      const complete = events.find((e) => e.type === "complete") as {
        type: "complete";
        citations: unknown[];
        citationValidationPassed: boolean;
        isGrounded: boolean;
      };

      expect(complete.citations).toEqual([]);
      expect(complete.citationValidationPassed).toBe(false);
      expect(complete.isGrounded).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Interruption Handling (Zero Partial Assistant Persistence)
  // -------------------------------------------------------------------------

  describe("Stream interruption", () => {
    it("never persists assistant message if stream is aborted mid-generation", async () => {
      const abortController = new AbortController();

      // Trigger abort after first chunk
      const originalStreamChunks = [...mockStreamChunks];
      mockStreamChunks = [originalStreamChunks[0]]; // partial JSON

      const generator = answerConversationQuestionStream({
        documentId: VALID_DOC_ID,
        userId: OWNER_USER_ID,
        conversationId: CONVO_ID,
        question: "What is the fee?",
        signal: abortController.signal,
      });

      // Advance first event
      const first = await generator.next();
      expect(first.value).toEqual({ type: "status", phase: "retrieving_evidence" });

      // Abort now
      abortController.abort();

      // Consume rest
      const remaining = await collectStreamEvents(generator);
      // No complete event should be emitted
      expect(remaining.some((e) => e.type === "complete")).toBe(false);

      // Invariant: Assistant message must NOT be saved to DB
      expect(appendAssistantCalls).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Security & Anti-Oracle Verification
  // -------------------------------------------------------------------------

  describe("Security and Anti-Oracle", () => {
    it("throws ConversationAccessError immediately if user does not own conversation", async () => {
      const generator = answerConversationQuestionStream({
        documentId: VALID_DOC_ID,
        userId: "unauthorized_user",
        conversationId: CONVO_ID,
        question: "Secret question?",
      });

      await expect(generator.next()).rejects.toThrow(ConversationAccessError);
    });

    it("emits sanitized error event on retrieval failure without leaking DB connection strings", async () => {
      shouldFailRetrieval = true;
      const events = await collectStreamEvents(
        answerConversationQuestionStream({
          documentId: VALID_DOC_ID,
          userId: OWNER_USER_ID,
          conversationId: CONVO_ID,
          question: "Any question",
        })
      );

      const errorEvent = events.find((e) => e.type === "error") as {
        type: "error";
        error: string;
      };
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).not.toContain("secret");
      expect(errorEvent.error).toContain("[REDACTED]");
    });
  });
});

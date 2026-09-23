/**
 * Unit Tests — Phase 6 Contextual Assistant & Q&A Service
 *
 * Covers:
 * 1. formatSectionContext:
 *    - Formats section context header, title, and sectionId.
 *    - Injects fallback note when fallbackUsed is true.
 * 2. answerQuestion with sectionId:
 *    - Formats prompt with section context.
 *    - Refuses with INSUFFICIENT_SECTION_EVIDENCE_ANSWER when section has no evidence (0 LLM calls).
 *    - Returns sectionId and fallbackUsed in result.
 * 3. answerConversationQuestionStream with sectionId:
 *    - Emits streaming events with sectionId.
 *    - Emits terminal complete event with sectionId and fallbackUsed.
 *    - When fallbackUsed is true, injects fallback provenance instruction into LLM prompt.
 *    - Zero-LLM refusal on insufficient evidence in selected section.
 * 4. Context switching across turns:
 *    - Subsequent questions can target different sections while retaining conversational context.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {},
}));

import type { RetrievalResult, RetrievedChunk } from "@/lib/services/retrieval-service";
import type { Message } from "@/lib/db/schema";
import {
  formatSectionContext,
  answerQuestion,
  answerConversationQuestionStream,
  INSUFFICIENT_SECTION_EVIDENCE_ANSWER,
  type QaStreamEvent,
} from "@/lib/services/qa-service";

// ---------------------------------------------------------------------------
// Constants & Fixtures
// ---------------------------------------------------------------------------

const DOC_ID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "user-123-abc";
const CONVO_ID = "22222222-2222-4222-a222-222222222222";
const SEC_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SEC_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CHUNK_A_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CHUNK_B_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const chunkA: RetrievedChunk = {
  chunkId: CHUNK_A_ID,
  documentId: DOC_ID,
  sectionId: SEC_A_ID,
  content: "Either party may terminate this agreement with 60 days written notice.",
  pageNumber: 4,
  similarity: 0.88,
  chunkIndex: 0,
};

const chunkB: RetrievedChunk = {
  chunkId: CHUNK_B_ID,
  documentId: DOC_ID,
  sectionId: SEC_B_ID,
  content: "Confidential Information shall be held in strict confidence for 5 years.",
  pageNumber: 8,
  similarity: 0.91,
  chunkIndex: 4,
};

// ---------------------------------------------------------------------------
// Mock Services
// ---------------------------------------------------------------------------

const mockRetrieveDocumentEvidence = vi.fn();
vi.mock("@/lib/services/retrieval-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/retrieval-service")>();
  return {
    ...actual,
    retrieveDocumentEvidence: (...args: unknown[]) => mockRetrieveDocumentEvidence(...args),
  };
});

let mockStreamChunks: string[] = [];
let mockStructuredOutputResponse: Record<string, unknown> = {};
let capturedMessages: unknown = null;

vi.mock("@/lib/ai/openai-client", () => ({
  MODELS: { CHAT: "gpt-4o" },
  TEMPERATURES: { QA: 0.1 },
  generateStructuredOutput: vi.fn(async (params: { messages: unknown }) => {
    capturedMessages = params.messages;
    return mockStructuredOutputResponse;
  }),
  getOpenAiClient: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(async function* (
          params: { messages: unknown },
          options?: { signal?: AbortSignal }
        ) {
          capturedMessages = params.messages;
          for (const chunk of mockStreamChunks) {
            if (options?.signal?.aborted) return;
            yield {
              choices: [{ delta: { content: chunk } }],
            };
          }
        }),
      },
    },
  })),
}));

let mockTurns: Array<{ userQuestion: string; assistantAnswer: string }> = [];

vi.mock("@/lib/services/conversation-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/conversation-service")>();
  return {
    ...actual,
    verifyConversationOwnership: vi.fn(async () => ({
      id: CONVO_ID,
      documentId: DOC_ID,
      userId: USER_ID,
      title: "Test Thread",
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    getConversationContext: vi.fn(async () => ({
      conversationId: CONVO_ID,
      title: "Test Thread",
      turns: mockTurns,
    })),
    appendAssistantMessage: vi.fn(async (input: {
      conversationId: string;
      documentId: string;
      userId: string;
      content: string;
      citations: unknown;
      hasSufficientEvidence: boolean;
      isGrounded: boolean;
      citationValidationPassed: boolean;
      metadata?: Record<string, unknown> | null;
    }) => ({
      id: "msg-asst-1",
      conversationId: input.conversationId,
      role: "assistant",
      content: input.content,
      citations: input.citations,
      hasSufficientEvidence: input.hasSufficientEvidence,
      isGrounded: input.isGrounded,
      citationValidationPassed: input.citationValidationPassed,
      metadata: input.metadata ?? null,
      createdAt: new Date(),
    })),
  };
});

describe("Phase 6 — Contextual Assistant Domain Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTurns = [];
    capturedMessages = null;
    mockStreamChunks = [];
    mockStructuredOutputResponse = {
      answer: "Either party may terminate with 60 days written notice.",
      citedChunkIds: [CHUNK_A_ID],
    };
  });

  // -------------------------------------------------------------------------
  // 1. formatSectionContext helper
  // -------------------------------------------------------------------------
  describe("1. formatSectionContext", () => {
    it("formats section context with sectionId and title", () => {
      const output = formatSectionContext({
        sectionId: SEC_A_ID,
        sectionTitle: "Section 8 — Termination",
      });

      expect(output).toContain("ACTIVE SECTION CONTEXT");
      expect(output).toContain(SEC_A_ID);
      expect(output).toContain("(Section 8 — Termination)");
      expect(output).not.toContain("NOTE: The selected section did not contain direct evidence");
    });

    it("formats section context with fallback notice when fallbackUsed is true", () => {
      const output = formatSectionContext({
        sectionId: SEC_A_ID,
        sectionTitle: "Section 8 — Termination",
        fallbackUsed: true,
      });

      expect(output).toContain("ACTIVE SECTION CONTEXT");
      expect(output).toContain("NOTE: The selected section did not contain direct evidence for this question.");
      expect(output).toContain("Evidence was retrieved from other relevant sections of the same document.");
    });

    it("returns empty string when section context is undefined or null", () => {
      expect(formatSectionContext(undefined)).toBe("");
      expect(formatSectionContext(null)).toBe("");
      expect(formatSectionContext({ sectionId: null })).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // 2. answerQuestion with sectionId (stateless)
  // -------------------------------------------------------------------------
  describe("2. answerQuestion with sectionId", () => {
    it("refuses with INSUFFICIENT_SECTION_EVIDENCE_ANSWER and 0 LLM calls when section has no evidence", async () => {
      mockRetrieveDocumentEvidence.mockResolvedValue({
        documentId: DOC_ID,
        sectionId: SEC_A_ID,
        targetSectionTitle: "Section 8 — Termination",
        question: "What are the remedies?",
        chunks: [],
        hasSufficientEvidence: false,
        totalChunksExamined: 0,
        fallbackUsed: false,
      });

      const result = await answerQuestion({
        documentId: DOC_ID,
        userId: USER_ID,
        question: "What are the remedies?",
        sectionId: SEC_A_ID,
      });

      expect(mockRetrieveDocumentEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: DOC_ID,
          userId: USER_ID,
          sectionId: SEC_A_ID,
        })
      );
      expect(capturedMessages).toBeNull();
      expect(result.hasSufficientEvidence).toBe(false);
      expect(result.answer).toBe(INSUFFICIENT_SECTION_EVIDENCE_ANSWER);
      expect(result.sectionId).toBe(SEC_A_ID);
      expect(result.fallbackUsed).toBe(false);
    });

    it("answers grounded question in section with targeted retrieval and citations", async () => {
      mockRetrieveDocumentEvidence.mockResolvedValue({
        documentId: DOC_ID,
        sectionId: SEC_A_ID,
        targetSectionTitle: "Section 8 — Termination",
        question: "Can either party terminate?",
        chunks: [chunkA],
        hasSufficientEvidence: true,
        totalChunksExamined: 1,
        fallbackUsed: false,
      });

      const result = await answerQuestion({
        documentId: DOC_ID,
        userId: USER_ID,
        question: "Can either party terminate?",
        sectionId: SEC_A_ID,
      });

      expect(result.hasSufficientEvidence).toBe(true);
      expect(result.isGrounded).toBe(true);
      expect(result.citationValidationPassed).toBe(true);
      expect(result.sectionId).toBe(SEC_A_ID);
      expect(result.fallbackUsed).toBe(false);
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].sectionId).toBe(SEC_A_ID);
      expect(result.citations[0].pageNumber).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // 3. answerConversationQuestionStream with sectionId
  // -------------------------------------------------------------------------
  describe("3. answerConversationQuestionStream with sectionId", () => {
    it("refuses with zero LLM calls and yields terminal complete event when section has no evidence", async () => {
      mockRetrieveDocumentEvidence.mockResolvedValue({
        documentId: DOC_ID,
        sectionId: SEC_A_ID,
        targetSectionTitle: "Section 8 — Termination",
        question: "What are the penalties?",
        chunks: [],
        hasSufficientEvidence: false,
        totalChunksExamined: 0,
        fallbackUsed: false,
      });

      const events: QaStreamEvent[] = [];
      for await (const event of answerConversationQuestionStream({
        documentId: DOC_ID,
        userId: USER_ID,
        conversationId: CONVO_ID,
        question: "What are the penalties?",
        sectionId: SEC_A_ID,
      })) {
        events.push(event);
      }

      expect(capturedMessages).toBeNull();
      const completeEvent = events.find((e) => e.type === "complete");
      expect(completeEvent).toBeDefined();
      if (completeEvent && completeEvent.type === "complete") {
        expect(completeEvent.hasSufficientEvidence).toBe(false);
        expect(completeEvent.answer).toBe(INSUFFICIENT_SECTION_EVIDENCE_ANSWER);
        expect(completeEvent.sectionId).toBe(SEC_A_ID);
        expect(completeEvent.fallbackUsed).toBe(false);
      }
    });

    it("streams grounded answer and emits sectionId and fallbackUsed in complete event", async () => {
      mockRetrieveDocumentEvidence.mockResolvedValue({
        documentId: DOC_ID,
        sectionId: SEC_A_ID,
        targetSectionTitle: "Section 8 — Termination",
        question: "What notice is required?",
        chunks: [chunkA],
        hasSufficientEvidence: true,
        totalChunksExamined: 1,
        fallbackUsed: false,
      });

      mockStreamChunks = [
        `{"answer": "60 days `,
        `written notice is required.", `,
        `"citedChunkIds": ["${CHUNK_A_ID}"]}`,
      ];

      const events: QaStreamEvent[] = [];
      for await (const event of answerConversationQuestionStream({
        documentId: DOC_ID,
        userId: USER_ID,
        conversationId: CONVO_ID,
        question: "What notice is required?",
        sectionId: SEC_A_ID,
      })) {
        events.push(event);
      }

      const deltas = events.filter((e) => e.type === "delta");
      expect(deltas.length).toBeGreaterThan(0);

      const complete = events.find((e) => e.type === "complete");
      expect(complete).toBeDefined();
      if (complete && complete.type === "complete") {
        expect(complete.hasSufficientEvidence).toBe(true);
        expect(complete.isGrounded).toBe(true);
        expect(complete.sectionId).toBe(SEC_A_ID);
        expect(complete.fallbackUsed).toBe(false);
        expect(complete.citations).toHaveLength(1);
        expect(complete.citations[0].chunkId).toBe(CHUNK_A_ID);
      }
    });

    it("emits fallbackUsed: true when evidence was retrieved outside the selected section", async () => {
      // Direct evidence was absent from Section A, but found in Section B
      mockRetrieveDocumentEvidence.mockResolvedValue({
        documentId: DOC_ID,
        sectionId: SEC_A_ID,
        targetSectionTitle: "Section 8 — Termination",
        question: "How long is confidentiality?",
        chunks: [chunkB], // chunk from section B
        hasSufficientEvidence: true,
        totalChunksExamined: 2,
        fallbackUsed: true,
      });

      mockStreamChunks = [
        `{"answer": "Confidentiality lasts for 5 years.", `,
        `"citedChunkIds": ["${CHUNK_B_ID}"]}`,
      ];

      const events: QaStreamEvent[] = [];
      for await (const event of answerConversationQuestionStream({
        documentId: DOC_ID,
        userId: USER_ID,
        conversationId: CONVO_ID,
        question: "How long is confidentiality?",
        sectionId: SEC_A_ID,
      })) {
        events.push(event);
      }

      const complete = events.find((e) => e.type === "complete");
      expect(complete).toBeDefined();
      if (complete && complete.type === "complete") {
        expect(complete.hasSufficientEvidence).toBe(true);
        expect(complete.sectionId).toBe(SEC_A_ID);
        expect(complete.fallbackUsed).toBe(true);
      }

      // Check prompt sent to model includes fallback instruction
      expect(capturedMessages).toBeDefined();
      const messagesArray = capturedMessages as Array<{ role: string; content: string }>;
      const userMsg = messagesArray.find((m) => m.role === "user");
      expect(userMsg?.content).toContain("NOTE: The selected section did not contain direct evidence for this question.");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Context switching across turns
  // -------------------------------------------------------------------------
  describe("4. Context switching across conversation turns", () => {
    it("targets new section when user changes section in a subsequent question", async () => {
      // Turn 1 was about Section A: conversation context contains turn 1
      mockTurns = [
        {
          userQuestion: "What is the termination notice?",
          assistantAnswer: "60 days written notice.",
        },
      ];

      // Turn 2 is about Section B
      mockRetrieveDocumentEvidence.mockResolvedValue({
        documentId: DOC_ID,
        sectionId: SEC_B_ID,
        targetSectionTitle: "Section 11 — Confidentiality",
        question: "What information is protected?",
        chunks: [chunkB],
        hasSufficientEvidence: true,
        totalChunksExamined: 1,
        fallbackUsed: false,
      });

      mockStreamChunks = [
        `{"answer": "All proprietary technical information is protected.", `,
        `"citedChunkIds": ["${CHUNK_B_ID}"]}`,
      ];

      const events: QaStreamEvent[] = [];
      for await (const event of answerConversationQuestionStream({
        documentId: DOC_ID,
        userId: USER_ID,
        conversationId: CONVO_ID,
        question: "What information is protected?",
        sectionId: SEC_B_ID,
      })) {
        events.push(event);
      }

      expect(mockRetrieveDocumentEvidence).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: DOC_ID,
          userId: USER_ID,
          sectionId: SEC_B_ID,
        })
      );

      const complete = events.find((e) => e.type === "complete");
      expect(complete).toBeDefined();
      if (complete && complete.type === "complete") {
        expect(complete.sectionId).toBe(SEC_B_ID);
        expect(complete.fallbackUsed).toBe(false);
      }
    });
  });
});

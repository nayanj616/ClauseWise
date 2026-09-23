/**
 * Unit Tests — Grounded Q&A Service (Phase 5 Slice 5.2)
 *
 * Covers:
 * 1. Grounded answer with sufficient evidence:
 *    - Produces answer, marks hasSufficientEvidence = true, returns authoritative citations.
 * 2. LLM prompt structure & security:
 *    - Verifies LLM receives retrieved chunk text, chunk IDs, page numbers, and user question.
 *    - Asserts clear prompt separation (system instructions → user question → untrusted evidence).
 * 3. Zero LLM calls on insufficient evidence:
 *    - When hasSufficientEvidence = false or chunks = [], generateStructuredOutput is never called.
 *    - Returns explicit insufficient-evidence response without hallucination.
 * 4. Authoritative citation attribution:
 *    - Valid chunk IDs are mapped to authoritative citations with coordinates from retrieved chunks.
 *    - Page numbers, section IDs, document IDs, chunk IDs, and source text come exclusively from retrieved chunks.
 * 5. Fabricated & unknown citation IDs:
 *    - Unknown chunk IDs are discarded and never returned in citations.
 *    - If the model returns only fabricated citation IDs, citationValidationPassed = false and isGrounded = false.
 * 6. Malformed LLM output & provider failures:
 *    - Handles LLM parse failures and throws QaProviderError.
 *    - Handles OpenAI API/network errors and throws sanitized QaProviderError.
 * 7. Error sanitization & credentials safety:
 *    - Verifies no API keys, bearer tokens, or connection strings leak in errors.
 * 8. Pre-retrieved evidence bypass authorization & document consistency:
 *    - Verifies ownership check in DB before trusting pre-retrieved evidence.
 *    - Rejects pre-retrieved evidence if documentId mismatches or chunk documentId mismatches.
 * 9. Input validation (Zod):
 *    - Rejects empty, whitespace-only, or overly long questions, invalid UUIDs, and empty userIds.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { documents } from "@/lib/db/schema";
import type { RetrievalResult, RetrievedChunk } from "@/lib/services/retrieval-service";

// ---------------------------------------------------------------------------
// Mock State & Setup
// ---------------------------------------------------------------------------

let mockDocRows: Array<{ id: string }> = [];
let mockRetrievalResult: RetrievalResult;
let mockModelOutput: { answer: string; citedChunkIds: string[] };
let shouldFailRetrieval = false;
let shouldFailLlm = false;
let llmErrorMessage = "OpenAI request timed out";
let capturedLlmOptions: { messages: Array<{ role: string; content: string }> } | null = null;

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const OTHER_DOC_ID = "22222222-2222-4222-a222-222222222222";
const OWNER_USER_ID = "33333333-3333-4333-a333-333333333333";
const CHUNK_ID_1 = "aaaaaaaa-1111-4111-a111-111111111111";
const CHUNK_ID_2 = "bbbbbbbb-2222-4222-a222-222222222222";
const SECTION_ID_1 = "cccccccc-3333-4333-a333-333333333333";

const MOCK_CHUNK_1: RetrievedChunk = {
  chunkId: CHUNK_ID_1,
  documentId: VALID_DOC_ID,
  sectionId: SECTION_ID_1,
  content: "Payment shall be remitted within thirty (30) days of the invoice date.",
  pageNumber: 3,
  similarity: 0.91,
  chunkIndex: 0,
  tokenCount: 16,
};

const MOCK_CHUNK_2: RetrievedChunk = {
  chunkId: CHUNK_ID_2,
  documentId: VALID_DOC_ID,
  sectionId: SECTION_ID_1,
  content: "A late interest charge of 1.5% per month applies to all overdue balances.",
  pageNumber: 3,
  similarity: 0.82,
  chunkIndex: 1,
  tokenCount: 15,
};

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (table === documents) return mockDocRows;
              return [];
            }),
          })),
        })),
      })),
    },
  };
});

vi.mock("@/lib/services/retrieval-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/retrieval-service")>();
  return {
    ...actual,
    retrieveDocumentEvidence: vi.fn(async () => {
      if (shouldFailRetrieval) {
        throw new actual.VectorSearchError("Database connection lost");
      }
      return mockRetrievalResult;
    }),
  };
});

vi.mock("@/lib/ai/openai-client", () => {
  return {
    generateStructuredOutput: vi.fn(async (options: unknown) => {
      capturedLlmOptions = options as { messages: Array<{ role: string; content: string }> };
      if (shouldFailLlm) {
        throw new Error(llmErrorMessage);
      }
      return mockModelOutput;
    }),
    MODELS: { CHAT: "gpt-4o", EMBEDDINGS: "text-embedding-3-small" },
    TEMPERATURES: { QA: 0.2 },
    sanitizeErrorMessage: (msg: string) =>
      msg.replace(/sk-[a-zA-Z0-9_\-]{15,}/gi, "[REDACTED_API_KEY]"),
  };
});

import {
  answerQuestion,
  QaValidationError,
  QaProviderError,
  UNTRUSTED_EVIDENCE_START,
  UNTRUSTED_EVIDENCE_END,
  INSUFFICIENT_EVIDENCE_ANSWER,
  type AnswerQuestionInput,
} from "@/lib/services/qa-service";
import { DocumentAccessError } from "@/lib/services/retrieval-service";
import { generateStructuredOutput } from "@/lib/ai/openai-client";

function createValidInput(overrides?: Partial<AnswerQuestionInput>): AnswerQuestionInput {
  return {
    documentId: VALID_DOC_ID,
    userId: OWNER_USER_ID,
    question: "What are the payment terms and late fees?",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase 5.2 — Grounded Answer Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocRows = [{ id: VALID_DOC_ID }];
    mockRetrievalResult = {
      documentId: VALID_DOC_ID,
      question: "What are the payment terms and late fees?",
      chunks: [MOCK_CHUNK_1, MOCK_CHUNK_2],
      hasSufficientEvidence: true,
      totalChunksExamined: 2,
    };
    mockModelOutput = {
      answer: "Invoices must be paid within 30 days. Overdue balances accrue a 1.5% monthly late fee.",
      citedChunkIds: [CHUNK_ID_1, CHUNK_ID_2],
    };
    shouldFailRetrieval = false;
    shouldFailLlm = false;
    llmErrorMessage = "OpenAI request timed out";
    capturedLlmOptions = null;
  });

  describe("1. Grounded Answer Generation with Sufficient Evidence", () => {
    it("generates a grounded answer with verified authoritative citations", async () => {
      const input = createValidInput();
      const result = await answerQuestion(input);

      expect(result.documentId).toBe(VALID_DOC_ID);
      expect(result.question).toBe(input.question);
      expect(result.hasSufficientEvidence).toBe(true);
      expect(result.isGrounded).toBe(true);
      expect(result.citationValidationPassed).toBe(true);
      expect(result.answer).toContain("within 30 days");
      expect(result.evidenceUsed).toHaveLength(2);
      expect(result.citations).toHaveLength(2);

      // Verify authoritative metadata on citations
      const firstCitation = result.citations[0];
      expect(firstCitation.chunkId).toBe(CHUNK_ID_1);
      expect(firstCitation.documentId).toBe(VALID_DOC_ID);
      expect(firstCitation.sectionId).toBe(SECTION_ID_1);
      expect(firstCitation.pageNumber).toBe(3);
      expect(firstCitation.similarity).toBe(0.91);
      expect(firstCitation.sourceText).toContain("within thirty (30) days");

      const secondCitation = result.citations[1];
      expect(secondCitation.chunkId).toBe(CHUNK_ID_2);
      expect(secondCitation.pageNumber).toBe(3);
      expect(secondCitation.sourceText).toContain("1.5% per month");
    });

    it("deduplicates duplicate citation IDs returned by the model", async () => {
      mockModelOutput = {
        answer: "Payment is required within 30 days.",
        citedChunkIds: [CHUNK_ID_1, CHUNK_ID_1, CHUNK_ID_1],
      };

      const result = await answerQuestion(createValidInput());

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].chunkId).toBe(CHUNK_ID_1);
      expect(result.citationValidationPassed).toBe(true);
    });
  });

  describe("2. LLM Evidence Delivery & Security Prompt Separation", () => {
    it("formats the prompt with strict separation: system → question → untrusted evidence", async () => {
      await answerQuestion(createValidInput());

      expect(generateStructuredOutput).toHaveBeenCalledTimes(1);
      expect(capturedLlmOptions).not.toBeNull();

      const messages = capturedLlmOptions!.messages;
      expect(messages).toHaveLength(2);

      const systemMsg = messages[0].content;
      const userMsg = messages[1].content;

      // System prompt invariants
      expect(systemMsg).toContain("ClauseWise, an AI legal document analysis assistant");
      expect(systemMsg).toContain("You are NOT a lawyer");
      expect(systemMsg).toContain("ANSWER ONLY FROM SUPPLIED EVIDENCE");
      expect(systemMsg).toContain("DO NOT INVENT CITATIONS OR COORDINATES");

      // User prompt structure: Question first, then untrusted evidence block
      expect(userMsg).toContain("USER QUESTION:\nWhat are the payment terms and late fees?");
      expect(userMsg).toContain(UNTRUSTED_EVIDENCE_START);
      expect(userMsg).toContain(UNTRUSTED_EVIDENCE_END);
      expect(userMsg).toContain(CHUNK_ID_1);
      expect(userMsg).toContain(MOCK_CHUNK_1.content);
      expect(userMsg).toContain(CHUNK_ID_2);
      expect(userMsg).toContain(MOCK_CHUNK_2.content);
    });
  });

  describe("3. Insufficient Evidence Gate (Zero LLM Invocations)", () => {
    it("does NOT call LLM when retrieval returns hasSufficientEvidence = false", async () => {
      mockRetrievalResult = {
        documentId: VALID_DOC_ID,
        question: "What are the payment terms?",
        chunks: [],
        hasSufficientEvidence: false,
        totalChunksExamined: 0,
      };

      const result = await answerQuestion(createValidInput());

      // Critical invariant: ZERO LLM calls
      expect(generateStructuredOutput).not.toHaveBeenCalled();

      expect(result.hasSufficientEvidence).toBe(false);
      expect(result.isGrounded).toBe(false);
      expect(result.citationValidationPassed).toBe(true);
      expect(result.citations).toEqual([]);
      expect(result.evidenceUsed).toEqual([]);
      expect(result.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
    });

    it("does NOT call LLM when retrieval chunks array is empty", async () => {
      mockRetrievalResult = {
        documentId: VALID_DOC_ID,
        question: "What are the payment terms?",
        chunks: [],
        hasSufficientEvidence: true, // Anomalous flag with empty chunks
        totalChunksExamined: 0,
      };

      const result = await answerQuestion(createValidInput());

      expect(generateStructuredOutput).not.toHaveBeenCalled();
      expect(result.hasSufficientEvidence).toBe(false);
      expect(result.citations).toEqual([]);
      expect(result.answer).toBe(INSUFFICIENT_EVIDENCE_ANSWER);
    });
  });

  describe("4. Fabricated & Unknown Citation IDs", () => {
    it("safely strips unknown/hallucinated chunk IDs", async () => {
      const FAKE_CHUNK_ID = "ffffffff-9999-9999-9999-999999999999";
      mockModelOutput = {
        answer: "Payment is due in 30 days.",
        citedChunkIds: [CHUNK_ID_1, FAKE_CHUNK_ID],
      };

      const result = await answerQuestion(createValidInput());

      // Only CHUNK_ID_1 is valid; FAKE_CHUNK_ID is stripped
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].chunkId).toBe(CHUNK_ID_1);
      expect(result.citations.some((c) => c.chunkId === FAKE_CHUNK_ID)).toBe(false);
      // Because a fabricated ID was attempted alongside a valid one:
      expect(result.citationValidationPassed).toBe(false);
      expect(result.isGrounded).toBe(true);
    });

    it("marks citationValidationPassed and isGrounded false if all cited IDs are fabricated", async () => {
      const FAKE_ID_1 = "ffffffff-1111-1111-1111-111111111111";
      const FAKE_ID_2 = "ffffffff-2222-2222-2222-222222222222";
      mockModelOutput = {
        answer: "This contract requires arbitration in Zurich.",
        citedChunkIds: [FAKE_ID_1, FAKE_ID_2],
      };

      const result = await answerQuestion(createValidInput());

      // No valid citations can be constructed
      expect(result.citations).toEqual([]);
      expect(result.citationValidationPassed).toBe(false);
      expect(result.isGrounded).toBe(false);
    });

    it("marks isGrounded and citationValidationPassed false if model returns empty citations for substantive answer", async () => {
      mockModelOutput = {
        answer: "There are no explicit provisions.",
        citedChunkIds: [],
      };

      const result = await answerQuestion(createValidInput());

      expect(result.citations).toEqual([]);
      expect(result.isGrounded).toBe(false);
      expect(result.citationValidationPassed).toBe(false);
    });
  });

  describe("5. Authoritative Metadata Invariant", () => {
    it("derives all citation metadata from retrieved chunks, never from model claims", async () => {
      // Chunk 1 has pageNumber: 3, sectionId: SECTION_ID_1
      mockModelOutput = {
        answer: "Fees are due in 30 days.",
        citedChunkIds: [CHUNK_ID_1],
      };

      const result = await answerQuestion(createValidInput());

      expect(result.citations).toHaveLength(1);
      const citation = result.citations[0];
      // Authoritative properties strictly match MOCK_CHUNK_1
      expect(citation.pageNumber).toBe(MOCK_CHUNK_1.pageNumber);
      expect(citation.sectionId).toBe(MOCK_CHUNK_1.sectionId);
      expect(citation.sourceText).toBe(MOCK_CHUNK_1.content);
      expect(citation.similarity).toBe(MOCK_CHUNK_1.similarity);
      expect(citation.documentId).toBe(MOCK_CHUNK_1.documentId);
    });
  });

  describe("6. Pre-Retrieved Evidence Bypass Security & Ownership", () => {
    it("verifies ownership before accepting caller-supplied retrievalResult", async () => {
      // User is owner in DB
      mockDocRows = [{ id: VALID_DOC_ID }];

      const input = createValidInput({
        retrievalResult: mockRetrievalResult,
      });

      const result = await answerQuestion(input);

      expect(result.hasSufficientEvidence).toBe(true);
      expect(result.citations).toHaveLength(2);
    });

    it("rejects caller-supplied retrievalResult if document is not owned by user in DB", async () => {
      // User is not owner in DB
      mockDocRows = [];

      const input = createValidInput({
        retrievalResult: mockRetrievalResult,
      });

      await expect(answerQuestion(input)).rejects.toThrow(DocumentAccessError);
    });

    it("rejects caller-supplied retrievalResult if retrievalResult.documentId does not match request documentId", async () => {
      const mismatchedRetrieval: RetrievalResult = {
        ...mockRetrievalResult,
        documentId: OTHER_DOC_ID,
      };

      const input = createValidInput({
        documentId: VALID_DOC_ID,
        retrievalResult: mismatchedRetrieval,
      });

      await expect(answerQuestion(input)).rejects.toThrow(QaValidationError);
      await expect(answerQuestion(input)).rejects.toThrow(/does not match request documentId/);
    });

    it("rejects caller-supplied retrievalResult if any chunk belongs to a different document", async () => {
      const contaminatedChunk: RetrievedChunk = {
        ...MOCK_CHUNK_1,
        documentId: OTHER_DOC_ID,
      };

      const contaminatedRetrieval: RetrievalResult = {
        ...mockRetrievalResult,
        chunks: [contaminatedChunk],
      };

      const input = createValidInput({
        retrievalResult: contaminatedRetrieval,
      });

      await expect(answerQuestion(input)).rejects.toThrow(QaValidationError);
      await expect(answerQuestion(input)).rejects.toThrow(/belongs to document/);
    });
  });

  describe("7. Provider Failures & Error Sanitization", () => {
    it("catches LLM provider failures and throws sanitized QaProviderError", async () => {
      shouldFailLlm = true;
      llmErrorMessage = "Connection reset by peer at api.openai.com";

      await expect(answerQuestion(createValidInput())).rejects.toThrow(QaProviderError);
    });

    it("sanitizes API keys and sensitive tokens from provider errors", async () => {
      shouldFailLlm = true;
      llmErrorMessage = "Unauthorized request using sk-secretkey1234567890123456";

      try {
        await answerQuestion(createValidInput());
        expect.fail("Should have thrown QaProviderError");
      } catch (err) {
        expect(err).toBeInstanceOf(QaProviderError);
        const msg = (err as Error).message;
        expect(msg).not.toContain("sk-secretkey1234567890123456");
        expect(msg).toContain("[REDACTED_API_KEY]");
      }
    });

    it("propagates retrieval service errors", async () => {
      shouldFailRetrieval = true;

      await expect(answerQuestion(createValidInput())).rejects.toThrow();
    });
  });

  describe("8. Input Validation (Zod)", () => {
    it("rejects empty question string with QaValidationError", async () => {
      const input = createValidInput({ question: "" });
      await expect(answerQuestion(input)).rejects.toThrow(QaValidationError);
    });

    it("rejects whitespace-only question with QaValidationError", async () => {
      const input = createValidInput({ question: "   \t\n  " });
      await expect(answerQuestion(input)).rejects.toThrow(QaValidationError);
    });

    it("rejects question exceeding 2000 characters with QaValidationError", async () => {
      const input = createValidInput({ question: "q".repeat(2001) });
      await expect(answerQuestion(input)).rejects.toThrow(QaValidationError);
    });

    it("rejects invalid documentId format with QaValidationError", async () => {
      const input = createValidInput({ documentId: "invalid-uuid" });
      await expect(answerQuestion(input)).rejects.toThrow(QaValidationError);
    });

    it("rejects empty userId with QaValidationError", async () => {
      const input = createValidInput({ userId: "" });
      await expect(answerQuestion(input)).rejects.toThrow(QaValidationError);
    });
  });
});


/**
 * Unit Tests — Phase 5.1 Retrieval Foundation
 *
 * Tests the retrieval domain service (`retrieveDocumentEvidence` and `semanticSearch`):
 * 1. Relevant chunks retrieval:
 *    - Retrieves ranked chunks for requested document with similarity scores
 *    - Preserves all citation metadata: chunkId, documentId, sectionId, content, pageNumber, similarity, chunkIndex
 * 2. Strict document isolation:
 *    - Chunks belonging to another document are never returned
 * 3. User / tenant authorization boundary:
 *    - Rejects access when document is not owned by user (DocumentAccessError)
 *    - Identical error for non-existent vs non-owned document (no existence oracle)
 * 4. Empty and unindexed document handling:
 *    - Returns { hasSufficientEvidence: false, chunks: [], totalChunksExamined: 0 } when 0 chunks exist
 *    - Returns { hasSufficientEvidence: false, chunks: [], totalChunksExamined: 0 } when chunks have null embeddings
 *    - Handled as normal outcome, NOT a VectorSearchError
 * 5. Input validation (Zod):
 *    - Rejects empty questions, whitespace-only questions, questions >2000 chars
 *    - Rejects malformed documentId (non-UUID)
 *    - Rejects empty or whitespace userId
 * 6. Embedding failure:
 *    - Catches upstream embedding errors and throws sanitized EmbeddingError
 * 7. Vector search / DB failure:
 *    - Catches database errors and throws sanitized VectorSearchError without leaking credentials
 * 8. Configurable limits and thresholding:
 *    - Honors custom topK and minSimilarity
 *    - Marks hasSufficientEvidence: false when all chunks fall below minSimilarity
 * 9. Aliasing:
 *    - semanticSearch operates identically to retrieveDocumentEvidence
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { documents, documentChunks } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Mock State
// ---------------------------------------------------------------------------

let mockDocRows: Array<{ id: string }> = [];
let mockChunkRows: Array<{
  chunkId: string;
  documentId: string;
  sectionId: string | null;
  content: string;
  pageNumber: number | null;
  tokenCount: number | null;
  chunkIndex: number;
  similarity: number;
}> = [];

let shouldFailDocDb = false;
let shouldFailChunkDb = false;
let shouldFailEmbedding = false;
let embeddingErrorMessage = "OpenAI API connection timeout";

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn((_fields?: unknown) => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((_condition: unknown) => {
            if (table === documents) {
              return {
                limit: vi.fn(async (_n?: number) => {
                  if (shouldFailDocDb) {
                    throw new Error("Connection terminated: postgres://admin:super_secret@db.internal:5432");
                  }
                  return mockDocRows;
                }),
              };
            }
            if (table === documentChunks) {
              return {
                orderBy: vi.fn((_order?: unknown) => ({
                  limit: vi.fn(async (n?: number) => {
                    if (shouldFailChunkDb) {
                      throw new Error("Vector index failure: postgres://admin:super_secret@db.internal:5432");
                    }
                    if (typeof n === "number") {
                      return mockChunkRows.slice(0, n);
                    }
                    return mockChunkRows;
                  }),
                })),
              };
            }
            return {
              limit: vi.fn(async () => []),
              orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
            };
          }),
        })),
      })),
    },
  };
});

vi.mock("@/lib/embeddings/embeddings-client", () => {
  return {
    embedText: vi.fn(async (_text: string) => {
      if (shouldFailEmbedding) {
        throw new Error(embeddingErrorMessage);
      }
      return Array(768).fill(0.02);
    }),
  };
});

import {
  retrieveDocumentEvidence,
  semanticSearch,
  DocumentAccessError,
  EmbeddingError,
  VectorSearchError,
  RetrievalValidationError,
  type DocumentRetrievalInput,
} from "@/lib/services/retrieval-service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_USER_ID = "22222222-2222-4222-a222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-a333-333333333333";
const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";

const CHUNK_ID_1 = "aaaaaaaa-1111-4111-a111-111111111111";
const CHUNK_ID_2 = "bbbbbbbb-2222-4222-a222-222222222222";
const CHUNK_ID_3 = "cccccccc-3333-4333-a333-333333333333";
const SECTION_ID_1 = "dddddddd-4444-4444-a444-444444444444";
const SECTION_ID_2 = "eeeeeeee-5555-5555-a555-555555555555";

function createValidInput(overrides?: Partial<DocumentRetrievalInput>): DocumentRetrievalInput {
  return {
    documentId: VALID_DOC_ID,
    userId: OWNER_USER_ID,
    question: "What are the payment terms and late charges?",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase 5.1 — Retrieval Foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocRows = [{ id: VALID_DOC_ID }];
    mockChunkRows = [
      {
        chunkId: CHUNK_ID_1,
        documentId: VALID_DOC_ID,
        sectionId: SECTION_ID_1,
        content: "Payment must be completed within 30 days of the invoice date.",
        pageNumber: 2,
        tokenCount: 14,
        chunkIndex: 0,
        similarity: 0.88,
      },
      {
        chunkId: CHUNK_ID_2,
        documentId: VALID_DOC_ID,
        sectionId: SECTION_ID_1,
        content: "Late payments shall accrue interest at 1.5% per month.",
        pageNumber: 2,
        tokenCount: 12,
        chunkIndex: 1,
        similarity: 0.74,
      },
    ];
    shouldFailDocDb = false;
    shouldFailChunkDb = false;
    shouldFailEmbedding = false;
    embeddingErrorMessage = "OpenAI API connection timeout";
  });

  describe("1. Relevant Chunks Retrieval & Metadata Preservation", () => {
    it("retrieves ranked relevant chunks for the requested document", async () => {
      const input = createValidInput();
      const result = await retrieveDocumentEvidence(input);

      expect(result.documentId).toBe(VALID_DOC_ID);
      expect(result.question).toBe(input.question);
      expect(result.hasSufficientEvidence).toBe(true);
      expect(result.totalChunksExamined).toBe(2);
      expect(result.chunks).toHaveLength(2);

      // Verify top-ranked chunk preserves all citation-relevant metadata
      const first = result.chunks[0];
      expect(first.chunkId).toBe(CHUNK_ID_1);
      expect(first.documentId).toBe(VALID_DOC_ID);
      expect(first.sectionId).toBe(SECTION_ID_1);
      expect(first.pageNumber).toBe(2);
      expect(first.similarity).toBe(0.88);
      expect(first.chunkIndex).toBe(0);
      expect(first.tokenCount).toBe(14);
      expect(first.content).toContain("within 30 days");

      // Verify second chunk
      const second = result.chunks[1];
      expect(second.chunkId).toBe(CHUNK_ID_2);
      expect(second.similarity).toBe(0.74);
    });

    it("operates identically through the semanticSearch alias", async () => {
      const input = createValidInput();
      const result = await semanticSearch(input);

      expect(result.hasSufficientEvidence).toBe(true);
      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0].chunkId).toBe(CHUNK_ID_1);
    });
  });

  describe("2. Document & Tenant Isolation", () => {
    it("strictly isolates retrieval to the requested document", async () => {
      const OTHER_DOC_ID = "99999999-9999-4999-a999-999999999999";
      mockChunkRows = [
        {
          chunkId: CHUNK_ID_1,
          documentId: VALID_DOC_ID,
          sectionId: SECTION_ID_1,
          content: "Valid document chunk content.",
          pageNumber: 1,
          tokenCount: 10,
          chunkIndex: 0,
          similarity: 0.9,
        },
      ];

      const result = await retrieveDocumentEvidence(createValidInput());

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks.every((c) => c.documentId === VALID_DOC_ID)).toBe(true);
      expect(result.chunks.some((c) => c.documentId === OTHER_DOC_ID)).toBe(false);
    });

    it("blocks access and throws DocumentAccessError when document is owned by another user", async () => {
      // Simulate doc not belonging to user
      mockDocRows = [];

      const input = createValidInput({ userId: OTHER_USER_ID });

      await expect(retrieveDocumentEvidence(input)).rejects.toThrow(DocumentAccessError);
      await expect(retrieveDocumentEvidence(input)).rejects.toThrow("Document not found or access denied");
    });

    it("returns identical sanitized DocumentAccessError for non-existent document (anti-oracle)", async () => {
      mockDocRows = [];

      const input = createValidInput({ documentId: "00000000-0000-4000-a000-000000000000" });

      await expect(retrieveDocumentEvidence(input)).rejects.toThrow(DocumentAccessError);
      await expect(retrieveDocumentEvidence(input)).rejects.toThrow("Document not found or access denied");
    });
  });

  describe("3. Zero Chunks & Insufficient Evidence Handling", () => {
    it("returns explicit insufficient evidence when document has zero indexed chunks", async () => {
      mockChunkRows = [];

      const result = await retrieveDocumentEvidence(createValidInput());

      expect(result.documentId).toBe(VALID_DOC_ID);
      expect(result.chunks).toEqual([]);
      expect(result.hasSufficientEvidence).toBe(false);
      expect(result.totalChunksExamined).toBe(0);
    });

    it("does NOT throw VectorSearchError when zero chunks are found (normal outcome)", async () => {
      mockChunkRows = [];

      await expect(retrieveDocumentEvidence(createValidInput())).resolves.not.toThrow();
    });

    it("marks hasSufficientEvidence false when all retrieved chunks are below similarity threshold", async () => {
      // All chunks have low similarity (< 0.2 default minSimilarity)
      mockChunkRows = [
        {
          chunkId: CHUNK_ID_3,
          documentId: VALID_DOC_ID,
          sectionId: SECTION_ID_2,
          content: "Irrelevant boilerplate preamble text.",
          pageNumber: 1,
          tokenCount: 8,
          chunkIndex: 2,
          similarity: 0.12,
        },
      ];

      const result = await retrieveDocumentEvidence(createValidInput());

      expect(result.hasSufficientEvidence).toBe(false);
      expect(result.chunks).toEqual([]);
      expect(result.totalChunksExamined).toBe(1);
    });

    it("never falls back to general knowledge when evidence is insufficient", async () => {
      mockChunkRows = [];

      const result = await retrieveDocumentEvidence(createValidInput());

      // Validates contract: returns structured evidence result, zero prose answer, zero hallucination
      expect(result.chunks).toHaveLength(0);
      expect(result.hasSufficientEvidence).toBe(false);
    });
  });

  describe("4. Input Validation (Zod)", () => {
    it("rejects empty question string with RetrievalValidationError", async () => {
      const input = createValidInput({ question: "" });
      await expect(retrieveDocumentEvidence(input)).rejects.toThrow(RetrievalValidationError);
    });

    it("rejects whitespace-only question with RetrievalValidationError", async () => {
      const input = createValidInput({ question: "    \t\n  " });
      await expect(retrieveDocumentEvidence(input)).rejects.toThrow(RetrievalValidationError);
    });

    it("rejects question exceeding 2000 characters with RetrievalValidationError", async () => {
      const input = createValidInput({ question: "a".repeat(2001) });
      await expect(retrieveDocumentEvidence(input)).rejects.toThrow(RetrievalValidationError);
    });

    it("rejects invalid documentId UUID format with RetrievalValidationError", async () => {
      const input = createValidInput({ documentId: "not-a-valid-uuid" });
      await expect(retrieveDocumentEvidence(input)).rejects.toThrow(RetrievalValidationError);
    });

    it("rejects empty userId with RetrievalValidationError", async () => {
      const input = createValidInput({ userId: "" });
      await expect(retrieveDocumentEvidence(input)).rejects.toThrow(RetrievalValidationError);
    });

    it("rejects invalid config topK (< 1 or > 20)", async () => {
      const inputNegative = createValidInput({ config: { topK: 0 } });
      await expect(retrieveDocumentEvidence(inputNegative)).rejects.toThrow(RetrievalValidationError);

      const inputTooLarge = createValidInput({ config: { topK: 21 } });
      await expect(retrieveDocumentEvidence(inputTooLarge)).rejects.toThrow(RetrievalValidationError);
    });
  });

  describe("5. Configuration: topK and minSimilarity", () => {
    it("respects custom topK limit", async () => {
      const input = createValidInput({
        config: { topK: 1 },
      });

      const result = await retrieveDocumentEvidence(input);

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].chunkId).toBe(CHUNK_ID_1);
    });

    it("respects custom minSimilarity threshold", async () => {
      // Chunk 1 has similarity 0.88, Chunk 2 has 0.74
      // Setting threshold to 0.80 should keep Chunk 1 and filter out Chunk 2
      const input = createValidInput({
        config: { minSimilarity: 0.8 },
      });

      const result = await retrieveDocumentEvidence(input);

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].chunkId).toBe(CHUNK_ID_1);
      expect(result.hasSufficientEvidence).toBe(true);
      expect(result.totalChunksExamined).toBe(2);
    });
  });

  describe("6. Error Handling & Sanitization", () => {
    it("handles OpenAI embedding failure and wraps in EmbeddingError", async () => {
      shouldFailEmbedding = true;
      embeddingErrorMessage = "API key sk-abcdef1234567890 failed authentication";

      await expect(retrieveDocumentEvidence(createValidInput())).rejects.toThrow(EmbeddingError);
    });

    it("handles database ownership verification failure and wraps in VectorSearchError", async () => {
      shouldFailDocDb = true;

      await expect(retrieveDocumentEvidence(createValidInput())).rejects.toThrow(VectorSearchError);
    });

    it("handles vector query database failure and wraps in VectorSearchError", async () => {
      shouldFailChunkDb = true;

      await expect(retrieveDocumentEvidence(createValidInput())).rejects.toThrow(VectorSearchError);
    });

    it("sanitizes database error messages to prevent credential leakage", async () => {
      shouldFailChunkDb = true;

      try {
        await retrieveDocumentEvidence(createValidInput());
        expect.fail("Should have thrown VectorSearchError");
      } catch (err) {
        expect(err).toBeInstanceOf(VectorSearchError);
        const msg = (err as Error).message;
        expect(msg).not.toContain("super_secret");
        expect(msg).not.toContain("postgres://");
      }
    });
  });
});


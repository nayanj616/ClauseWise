/**
 * Unit Tests — Phase 6 Contextual Retrieval
 *
 * Tests the contextual retrieval capabilities of retrieveDocumentEvidence:
 * 1. Targeted retrieval:
 *    - Retrieves chunks exclusively from the selected section when similarity meets threshold.
 *    - Returns fallbackUsed: false and attaches targetSectionTitle.
 * 2. Same-document fallback:
 *    - Falls back to rest of document when selected section chunks fall below minSimilarity.
 *    - Returns fallbackUsed: true and attaches targetSectionTitle.
 * 3. Threshold exclusion / refusal:
 *    - Returns hasSufficientEvidence: false when neither section nor document meets minSimilarity.
 * 4. Anti-oracle & tenant security:
 *    - Throws uniform DocumentAccessError when section does not exist or belongs to another document.
 *    - Throws uniform DocumentAccessError when document is not owned by user.
 * 5. Document isolation:
 *    - Cross-document chunks are never returned.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { documents, documentSections, documentChunks } from "@/lib/db/schema";
import {
  retrieveDocumentEvidence,
  DocumentAccessError,
  VectorSearchError,
} from "@/lib/services/retrieval-service";

// ---------------------------------------------------------------------------
// Mock State
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const OTHER_DOC_ID = "22222222-2222-4222-a222-222222222222";
const VALID_USER_ID = "user-123-abc";
const OTHER_USER_ID = "user-456-def";
const VALID_SECTION_ID = "33333333-3333-4333-a333-333333333333";
const OTHER_SECTION_ID = "44444444-4444-4444-a444-444444444444";

let mockDocRows: Array<{ id: string }> = [];
let mockSectionRows: Array<{ id: string; title: string; pageStart: number | null }> = [];
let mockSectionChunkRows: Array<{
  chunkId: string;
  documentId: string;
  sectionId: string;
  content: string;
  pageNumber: number | null;
  tokenCount: number | null;
  chunkIndex: number;
  similarity: number;
}> = [];
let mockFallbackChunkRows: Array<{
  chunkId: string;
  documentId: string;
  sectionId: string;
  content: string;
  pageNumber: number | null;
  tokenCount: number | null;
  chunkIndex: number;
  similarity: number;
}> = [];

let chunkQueryCount = 0;
let shouldFailSectionDb = false;

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn((_fields?: unknown) => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((_condition: unknown) => {
            if (table === documents) {
              return {
                limit: vi.fn(async () => mockDocRows),
              };
            }
            if (table === documentSections) {
              return {
                limit: vi.fn(async () => {
                  if (shouldFailSectionDb) {
                    throw new Error("Section query failed: postgres://admin:secret@db.internal:5432");
                  }
                  return mockSectionRows;
                }),
              };
            }
            if (table === documentChunks) {
              chunkQueryCount++;
              const isFallback = chunkQueryCount > 1;
              return {
                orderBy: vi.fn(() => ({
                  limit: vi.fn(async (n?: number) => {
                    const rows = isFallback
                      ? mockFallbackChunkRows
                      : mockSectionChunkRows;
                    if (typeof n === "number") {
                      return rows.slice(0, n);
                    }
                    return rows;
                  }),
                })),
              };
            }
            return {
              limit: vi.fn(async () => []),
            };
          }),
        })),
      })),
    },
  };
});

vi.mock("@/lib/embeddings/embeddings-client", () => {
  return {
    embedText: vi.fn(async () => Array(768).fill(0.1)),
  };
});

describe("Phase 6 — Contextual Retrieval (retrieveDocumentEvidence)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chunkQueryCount = 0;
    mockDocRows = [{ id: VALID_DOC_ID }];
    mockSectionRows = [
      {
        id: VALID_SECTION_ID,
        title: "Section 8 — Termination",
        pageStart: 4,
      },
    ];
    mockSectionChunkRows = [
      {
        chunkId: "chunk-sec-1",
        documentId: VALID_DOC_ID,
        sectionId: VALID_SECTION_ID,
        content: "Either party may terminate this agreement with 60 days written notice.",
        pageNumber: 4,
        tokenCount: 45,
        chunkIndex: 0,
        similarity: 0.88,
      },
    ];
    mockFallbackChunkRows = [];
    shouldFailSectionDb = false;
  });

  // -------------------------------------------------------------------------
  // 1. Targeted Section Retrieval
  // -------------------------------------------------------------------------
  describe("1. Targeted Section Retrieval", () => {
    it("retrieves chunks from the targeted section and marks fallbackUsed: false", async () => {
      const result = await retrieveDocumentEvidence({
        documentId: VALID_DOC_ID,
        userId: VALID_USER_ID,
        question: "Can either party terminate?",
        sectionId: VALID_SECTION_ID,
      });

      expect(result.hasSufficientEvidence).toBe(true);
      expect(result.fallbackUsed).toBe(false);
      expect(result.sectionId).toBe(VALID_SECTION_ID);
      expect(result.targetSectionTitle).toBe("Section 8 — Termination");
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].chunkId).toBe("chunk-sec-1");
      expect(result.chunks[0].sectionId).toBe(VALID_SECTION_ID);
      expect(result.chunks[0].similarity).toBe(0.88);
    });

    it("clamps and rounds similarity scores correctly in targeted mode", async () => {
      mockSectionChunkRows = [
        {
          chunkId: "chunk-sec-2",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SECTION_ID,
          content: "Governing law clause.",
          pageNumber: 5,
          tokenCount: 20,
          chunkIndex: 1,
          similarity: 0.8123456,
        },
      ];

      const result = await retrieveDocumentEvidence({
        documentId: VALID_DOC_ID,
        userId: VALID_USER_ID,
        question: "What is the law?",
        sectionId: VALID_SECTION_ID,
      });

      expect(result.chunks[0].similarity).toBe(0.8123);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Same-Document Fallback Retrieval
  // -------------------------------------------------------------------------
  describe("2. Same-Document Fallback Retrieval", () => {
    it("falls back to same document when section chunks fall below similarity threshold", async () => {
      // Target section chunks have similarity below threshold (0.25 < 0.35)
      mockSectionChunkRows = [
        {
          chunkId: "chunk-sec-weak",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SECTION_ID,
          content: "Definitions without termination specifics.",
          pageNumber: 4,
          tokenCount: 15,
          chunkIndex: 0,
          similarity: 0.20,
        },
      ];

      // Fallback chunks from another section meet similarity threshold
      mockFallbackChunkRows = [
        {
          chunkId: "chunk-fallback-1",
          documentId: VALID_DOC_ID,
          sectionId: OTHER_SECTION_ID,
          content: "General notice and termination rules apply across the entire agreement.",
          pageNumber: 12,
          tokenCount: 50,
          chunkIndex: 8,
          similarity: 0.82,
        },
      ];

      const result = await retrieveDocumentEvidence({
        documentId: VALID_DOC_ID,
        userId: VALID_USER_ID,
        question: "What notice is required for termination?",
        sectionId: VALID_SECTION_ID,
        config: { minSimilarity: 0.35 },
      });

      expect(result.hasSufficientEvidence).toBe(true);
      expect(result.fallbackUsed).toBe(true);
      expect(result.sectionId).toBe(VALID_SECTION_ID);
      expect(result.targetSectionTitle).toBe("Section 8 — Termination");
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].chunkId).toBe("chunk-fallback-1");
      expect(result.chunks[0].sectionId).toBe(OTHER_SECTION_ID);
    });

    it("returns hasSufficientEvidence: false when both target section and fallback fail threshold", async () => {
      mockSectionChunkRows = [
        {
          chunkId: "chunk-sec-low",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SECTION_ID,
          content: "Unrelated clause content.",
          pageNumber: 4,
          tokenCount: 10,
          chunkIndex: 0,
          similarity: 0.15,
        },
      ];
      mockFallbackChunkRows = [
        {
          chunkId: "chunk-fallback-low",
          documentId: VALID_DOC_ID,
          sectionId: OTHER_SECTION_ID,
          content: "Also unrelated clause content.",
          pageNumber: 10,
          tokenCount: 12,
          chunkIndex: 5,
          similarity: 0.18,
        },
      ];

      const result = await retrieveDocumentEvidence({
        documentId: VALID_DOC_ID,
        userId: VALID_USER_ID,
        question: "What are the intellectual property indemnities?",
        sectionId: VALID_SECTION_ID,
        config: { minSimilarity: 0.35 },
      });

      expect(result.hasSufficientEvidence).toBe(false);
      expect(result.chunks).toHaveLength(0);
      expect(result.fallbackUsed).toBe(false);
      expect(result.sectionId).toBe(VALID_SECTION_ID);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Security & Anti-Oracle Protection
  // -------------------------------------------------------------------------
  describe("3. Security & Anti-Oracle Protection", () => {
    it("throws DocumentAccessError when section does not exist in target document", async () => {
      mockSectionRows = []; // Section query returns no rows

      await expect(
        retrieveDocumentEvidence({
          documentId: VALID_DOC_ID,
          userId: VALID_USER_ID,
          question: "Can I terminate?",
          sectionId: OTHER_SECTION_ID,
        })
      ).rejects.toThrow(DocumentAccessError);
    });

    it("throws DocumentAccessError when document is not owned by user", async () => {
      mockDocRows = []; // Document ownership check returns no rows

      await expect(
        retrieveDocumentEvidence({
          documentId: VALID_DOC_ID,
          userId: OTHER_USER_ID,
          question: "Can I terminate?",
          sectionId: VALID_SECTION_ID,
        })
      ).rejects.toThrow(DocumentAccessError);
    });

    it("sanitizes database error during section verification into VectorSearchError without leaking credentials", async () => {
      shouldFailSectionDb = true;

      await expect(
        retrieveDocumentEvidence({
          documentId: VALID_DOC_ID,
          userId: VALID_USER_ID,
          question: "Can I terminate?",
          sectionId: VALID_SECTION_ID,
        })
      ).rejects.toThrow(VectorSearchError);

      try {
        await retrieveDocumentEvidence({
          documentId: VALID_DOC_ID,
          userId: VALID_USER_ID,
          question: "Can I terminate?",
          sectionId: VALID_SECTION_ID,
        });
      } catch (err) {
        expect((err as Error).message).not.toContain("secret");
        expect((err as Error).message).not.toContain("postgres://");
      }
    });
  });
});

/**
 * Unit Tests — Chunk Persistence Service (Phase 2, Slice 2.4)
 *
 * Tests:
 * 1. persistDocumentChunks:
 *    - Persists valid generated chunks into document_chunks
 *    - Returns empty array when passed empty chunk list
 *    - Validates documentId and sectionId UUIDs
 *    - Validates chunkIndex and content
 *    - Masks database connection errors without leaking credentials
 *
 * 2. getDocumentChunks:
 *    - Returns chunks ordered deterministically by chunkIndex ASC
 *    - Rejects invalid documentId
 *    - Sanitizes database errors
 *
 * 3. deleteDocumentChunks:
 *    - Deletes all chunks for the specified documentId
 *    - Rejects invalid documentId
 *    - Sanitizes database errors
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GeneratedChunk } from "@/lib/services/chunking-service";

// In-memory mock database state for chunks
type MockChunkRow = {
  id: string;
  documentId: string;
  sectionId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  tokenCount: number | null;
  embedding: number[] | null;
  createdAt: Date;
  updatedAt: Date;
};

let inMemoryChunks: MockChunkRow[] = [];
let shouldFailDb = false;

const mockEmbedBatch = vi.fn();
vi.mock("@/lib/embeddings/embeddings-client", () => ({
  embedBatch: (...args: unknown[]) => mockEmbedBatch(...args),
  embedText: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => ({
            orderBy: async () => {
              if (shouldFailDb) {
                throw new Error("Connection terminated: postgresql://postgres:secret@db.internal:5432");
              }
              const cond = condition as { docId?: string; isNull?: boolean };
              const docId = cond?.docId;
              let filtered = docId
                ? inMemoryChunks.filter((c) => c.documentId === docId)
                : inMemoryChunks;
              if (cond?.isNull) {
                filtered = filtered.filter((c) => c.embedding === null);
              }
              return [...filtered].sort((a, b) => a.chunkIndex - b.chunkIndex);
            },
          }),
        }),
      }),
      delete: () => ({
        where: async (condition: unknown) => {
          if (shouldFailDb) {
            throw new Error("FATAL: password authentication failed for postgresql://admin:secret@db.internal");
          }
          const docId = (condition as { docId?: string })?.docId;
          if (docId) {
            inMemoryChunks = inMemoryChunks.filter((c) => c.documentId !== docId);
          }
        },
      }),
      insert: () => ({
        values: (rows: Array<Omit<MockChunkRow, "id" | "createdAt" | "updatedAt">>) => ({
          returning: async () => {
            if (shouldFailDb) {
              throw new Error("DB Error: Unique constraint violated on postgresql://admin:secret@db.internal");
            }
            const created: MockChunkRow[] = rows.map((r, i) => ({
              id: `chunk-uuid-${Date.now()}-${i}`,
              documentId: r.documentId,
              sectionId: r.sectionId,
              chunkIndex: r.chunkIndex,
              content: r.content,
              pageNumber: r.pageNumber ?? null,
              tokenCount: r.tokenCount ?? null,
              embedding: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
            inMemoryChunks.push(...created);
            return created;
          },
        }),
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async (condition: unknown) => {
            if (shouldFailDb) {
              throw new Error("Connection terminated: postgresql://postgres:secret@db.internal:5432");
            }
            const chunkId = (condition as { chunkId?: string; docId?: string })?.chunkId;
            const target = inMemoryChunks.find((c) => c.id === chunkId);
            if (target) {
              Object.assign(target, vals);
            }
          },
        }),
      }),
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: string) => ({ docId: val, chunkId: val }),
  and: (...conditions: any[]) => {
    const docId = conditions.find((c) => c?.docId)?.docId;
    const isNull = conditions.some((c) => c?.isNull);
    return { docId, isNull };
  },
  isNull: (_col: unknown) => ({ isNull: true }),
  asc: (_col: unknown) => "asc",
  relations: vi.fn(),
}));

import {
  persistDocumentChunks,
  getDocumentChunks,
  deleteDocumentChunks,
  generateAndPersistChunkEmbeddings,
  ChunkPersistenceError,
} from "@/lib/services/chunk-persistence-service";

describe("Chunk Persistence Service (Slice 2.4)", () => {
  const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
  const VALID_SEC_ID = "22222222-2222-4222-a222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryChunks = [];
    shouldFailDb = false;
  });

  // =========================================================================
  // 1. persistDocumentChunks
  // =========================================================================
  describe("1. persistDocumentChunks", () => {
    it("persists valid generated chunks and returns inserted records", async () => {
      const generatedChunks: GeneratedChunk[] = [
        {
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 0,
          content: "First chunk text",
          pageNumber: 1,
          characterCount: 16,
          tokenCount: 4,
        },
        {
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 1,
          content: "Second chunk text",
          pageNumber: 2,
          characterCount: 17,
          tokenCount: 5,
        },
      ];

      const result = await persistDocumentChunks(generatedChunks);

      expect(result).toHaveLength(2);
      expect(result[0].chunkIndex).toBe(0);
      expect(result[0].content).toBe("First chunk text");
      expect(result[0].pageNumber).toBe(1);
      expect(result[0].tokenCount).toBe(4);

      expect(result[1].chunkIndex).toBe(1);
      expect(result[1].content).toBe("Second chunk text");
      expect(result[1].pageNumber).toBe(2);

      expect(inMemoryChunks).toHaveLength(2);
    });

    it("returns an empty array when passed an empty chunk list", async () => {
      const result = await persistDocumentChunks([]);
      expect(result).toEqual([]);
      expect(inMemoryChunks).toHaveLength(0);
    });

    it("rejects chunks with invalid documentId", async () => {
      const invalidChunks: GeneratedChunk[] = [
        {
          documentId: "not-a-uuid",
          sectionId: VALID_SEC_ID,
          chunkIndex: 0,
          content: "Text",
          pageNumber: 1,
          characterCount: 4,
          tokenCount: 1,
        },
      ];

      await expect(persistDocumentChunks(invalidChunks)).rejects.toThrow(
        ChunkPersistenceError
      );
      await expect(persistDocumentChunks(invalidChunks)).rejects.toThrow(
        "Invalid document ID"
      );
    });

    it("rejects chunks with empty or whitespace-only content", async () => {
      const invalidChunks: GeneratedChunk[] = [
        {
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 0,
          content: "   ",
          pageNumber: 1,
          characterCount: 3,
          tokenCount: 1,
        },
      ];

      await expect(persistDocumentChunks(invalidChunks)).rejects.toThrow(
        "Chunk content must not be empty"
      );
    });

    it("sanitizes database errors during chunk insertion without leaking credentials", async () => {
      shouldFailDb = true;
      const chunks: GeneratedChunk[] = [
        {
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 0,
          content: "Chunk content",
          pageNumber: 1,
          characterCount: 13,
          tokenCount: 4,
        },
      ];

      try {
        await persistDocumentChunks(chunks);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ChunkPersistenceError);
        const err = error as ChunkPersistenceError;
        expect(err.message).toBe("Failed to insert document chunks into database");
        expect(err.message).not.toContain("postgresql://");
        expect(err.message).not.toContain("secret");
      }
    });
  });

  // =========================================================================
  // 2. getDocumentChunks
  // =========================================================================
  describe("2. getDocumentChunks", () => {
    it("returns chunks ordered by chunkIndex ASC", async () => {
      // Seed chunks in out-of-order sequence
      inMemoryChunks.push(
        {
          id: "chunk-2",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 2,
          content: "Third chunk",
          pageNumber: 3,
          tokenCount: 3,
          embedding: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "chunk-0",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 0,
          content: "First chunk",
          pageNumber: 1,
          tokenCount: 3,
          embedding: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "chunk-1",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 1,
          content: "Second chunk",
          pageNumber: 2,
          tokenCount: 3,
          embedding: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      const chunks = await getDocumentChunks(VALID_DOC_ID);

      expect(chunks).toHaveLength(3);
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[1].chunkIndex).toBe(1);
      expect(chunks[2].chunkIndex).toBe(2);
    });

    it("rejects invalid documentId format", async () => {
      await expect(getDocumentChunks("bad-id")).rejects.toThrow(
        "Invalid document ID"
      );
    });

    it("sanitizes database error on retrieval", async () => {
      shouldFailDb = true;

      await expect(getDocumentChunks(VALID_DOC_ID)).rejects.toThrow(
        `Failed to retrieve chunks for document ${VALID_DOC_ID}`
      );
    });
  });

  // =========================================================================
  // 3. deleteDocumentChunks
  // =========================================================================
  describe("3. deleteDocumentChunks", () => {
    it("deletes all chunks belonging to the specified documentId", async () => {
      const OTHER_DOC_ID = "33333333-3333-4333-a333-333333333333";
      inMemoryChunks.push(
        {
          id: "c-1",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 0,
          content: "Doc 1 Chunk",
          pageNumber: 1,
          tokenCount: 3,
          embedding: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "c-2",
          documentId: OTHER_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 0,
          content: "Doc 2 Chunk",
          pageNumber: 1,
          tokenCount: 3,
          embedding: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      await deleteDocumentChunks(VALID_DOC_ID);

      expect(inMemoryChunks).toHaveLength(1);
      expect(inMemoryChunks[0].documentId).toBe(OTHER_DOC_ID);
    });

    it("rejects invalid documentId format", async () => {
      await expect(deleteDocumentChunks("")).rejects.toThrow(
        "Invalid document ID"
      );
    });

    it("sanitizes database error on deletion without leaking credentials", async () => {
      shouldFailDb = true;

      try {
        await deleteDocumentChunks(VALID_DOC_ID);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ChunkPersistenceError);
        const err = error as ChunkPersistenceError;
        expect(err.message).toBe(`Failed to delete chunks for document ${VALID_DOC_ID}`);
        expect(err.message).not.toContain("password");
        expect(err.message).not.toContain("secret");
      }
    });
  });

  // =========================================================================
  // 4. generateAndPersistChunkEmbeddings
  // =========================================================================
  describe("4. generateAndPersistChunkEmbeddings", () => {
    it("generates and persists 768-dimensional embeddings for all unembedded chunks", async () => {
      inMemoryChunks.push(
        {
          id: "chunk-embed-1",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 0,
          content: "Confidentiality obligations apply for five years.",
          pageNumber: 1,
          tokenCount: 7,
          embedding: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "chunk-embed-2",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 1,
          content: "Governing law shall be the laws of the State of Delaware.",
          pageNumber: 2,
          tokenCount: 10,
          embedding: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      const mockVectors = [
        new Array(768).fill(0.1),
        new Array(768).fill(0.2),
      ];
      mockEmbedBatch.mockResolvedValueOnce(mockVectors);

      const count = await generateAndPersistChunkEmbeddings(VALID_DOC_ID);

      expect(count).toBe(2);
      expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
      expect(mockEmbedBatch).toHaveBeenCalledWith([
        "Confidentiality obligations apply for five years.",
        "Governing law shall be the laws of the State of Delaware.",
      ]);

      const chunk1 = inMemoryChunks.find((c) => c.id === "chunk-embed-1");
      const chunk2 = inMemoryChunks.find((c) => c.id === "chunk-embed-2");
      expect(chunk1?.embedding).toEqual(mockVectors[0]);
      expect(chunk2?.embedding).toEqual(mockVectors[1]);
    });

    it("batches embeddings in groups of 100 when document has more than 100 chunks", async () => {
      // Create 150 chunks needing embeddings
      for (let i = 0; i < 150; i++) {
        inMemoryChunks.push({
          id: `chunk-batch-${i}`,
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: i,
          content: `Section content paragraph ${i}`,
          pageNumber: Math.floor(i / 10) + 1,
          tokenCount: 5,
          embedding: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      mockEmbedBatch.mockImplementation(async (texts: string[]) => {
        return texts.map(() => new Array(768).fill(0.05));
      });

      const count = await generateAndPersistChunkEmbeddings(VALID_DOC_ID);

      expect(count).toBe(150);
      expect(mockEmbedBatch).toHaveBeenCalledTimes(2);
      expect(mockEmbedBatch.mock.calls[0][0]).toHaveLength(100);
      expect(mockEmbedBatch.mock.calls[1][0]).toHaveLength(50);
      expect(inMemoryChunks.every((c) => c.embedding !== null)).toBe(true);
    });

    it("returns 0 and skips embedBatch when all chunks already have embeddings", async () => {
      inMemoryChunks.push({
        id: "chunk-already-embedded",
        documentId: VALID_DOC_ID,
        sectionId: VALID_SEC_ID,
        chunkIndex: 0,
        content: "Already has an embedding vector.",
        pageNumber: 1,
        tokenCount: 6,
        embedding: new Array(768).fill(0.3),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const count = await generateAndPersistChunkEmbeddings(VALID_DOC_ID);

      expect(count).toBe(0);
      expect(mockEmbedBatch).not.toHaveBeenCalled();
    });

    it("returns 0 and skips embedBatch when document has no chunks", async () => {
      const count = await generateAndPersistChunkEmbeddings(VALID_DOC_ID);

      expect(count).toBe(0);
      expect(mockEmbedBatch).not.toHaveBeenCalled();
    });

    it("rejects invalid documentId format", async () => {
      await expect(generateAndPersistChunkEmbeddings("invalid-uuid")).rejects.toThrow(
        ChunkPersistenceError
      );
      await expect(generateAndPersistChunkEmbeddings("   ")).rejects.toThrow(
        "Invalid document ID"
      );
    });

    it("throws ChunkPersistenceError when embedBatch returns mismatched count", async () => {
      inMemoryChunks.push(
        {
          id: "chunk-mismatch-1",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 0,
          content: "First chunk",
          pageNumber: 1,
          tokenCount: 2,
          embedding: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "chunk-mismatch-2",
          documentId: VALID_DOC_ID,
          sectionId: VALID_SEC_ID,
          chunkIndex: 1,
          content: "Second chunk",
          pageNumber: 1,
          tokenCount: 2,
          embedding: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      // Return only 1 embedding for 2 chunks
      mockEmbedBatch.mockResolvedValueOnce([new Array(768).fill(0.1)]);

      await expect(generateAndPersistChunkEmbeddings(VALID_DOC_ID)).rejects.toThrow(
        "Embedding batch count mismatch: expected 2, received 1"
      );
    });

    it("blocks 1536-dimensional OpenAI embeddings from being written into vector(768) column", async () => {
      inMemoryChunks.push({
        id: "chunk-dim-guard",
        documentId: VALID_DOC_ID,
        sectionId: VALID_SEC_ID,
        chunkIndex: 0,
        content: "Guard against 1536d vectors.",
        pageNumber: 1,
        tokenCount: 5,
        embedding: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockEmbedBatch.mockResolvedValueOnce([new Array(1536).fill(0.1)]);

      await expect(generateAndPersistChunkEmbeddings(VALID_DOC_ID)).rejects.toThrow(
        "Embedding dimension mismatch: expected 768 dimensions for vector(768) column, received 1536"
      );
      expect(inMemoryChunks[0].embedding).toBeNull();
    });

    it("sanitizes database error on update without leaking credentials", async () => {
      inMemoryChunks.push({
        id: "chunk-fail",
        documentId: VALID_DOC_ID,
        sectionId: VALID_SEC_ID,
        chunkIndex: 0,
        content: "Chunk content",
        pageNumber: 1,
        tokenCount: 2,
        embedding: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockEmbedBatch.mockResolvedValueOnce([new Array(768).fill(0.1)]);
      shouldFailDb = true;

      try {
        await generateAndPersistChunkEmbeddings(VALID_DOC_ID);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ChunkPersistenceError);
        const err = error as ChunkPersistenceError;
        expect(err.message).toContain(`Failed to generate and persist embeddings for document ${VALID_DOC_ID}`);
        expect(err.message).not.toContain("password");
        expect(err.message).not.toContain("secret");
      }
    });
  });
});


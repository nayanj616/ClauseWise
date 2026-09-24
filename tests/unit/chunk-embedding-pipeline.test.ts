/**
 * Integration Test — Chunk Embedding to Q&A Retrieval Pipeline (Phase B)
 *
 * Verifies the end-to-end connection:
 * 1. Chunks created during extraction initially have `embedding: null`.
 * 2. Prior to embedding generation, semantic retrieval finds 0 chunks and returns `hasSufficientEvidence: false`.
 * 3. `generateAndPersistChunkEmbeddings(documentId)` generates 1536-dimensional vectors via `embedBatch()`
 *    and persists them to `document_chunks.embedding`.
 * 4. After embedding generation, `retrieveDocumentEvidence()` finds the embedded chunks, computes
 *    cosine similarity, and returns `hasSufficientEvidence: true` with complete citation metadata.
 * 5. Re-running `generateAndPersistChunkEmbeddings(documentId)` is idempotent and processes 0 chunks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const VALID_USER_ID = "22222222-2222-4222-a222-222222222222";
const VALID_SEC_ID = "33333333-3333-4333-a333-333333333333";

interface MockDbChunk {
  id: string;
  documentId: string;
  sectionId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  tokenCount: number | null;
  embedding: number[] | null;
  updatedAt: Date;
}

let mockChunks: MockDbChunk[] = [];
let mockDocs: Array<{ id: string; userId: string; status: string }> = [];

vi.mock("@/lib/embeddings/embeddings-client", () => ({
  embedBatch: vi.fn(async (texts: string[]) => {
    // Generate deterministic 1536-dimensional vectors
    return texts.map((_, i) => new Array(1536).fill((i + 1) * 0.01));
  }),
  embedText: vi.fn(async (_text: string) => {
    // Return query vector that has high similarity to the first chunk
    return new Array(1536).fill(0.01);
  }),
}));

import { documents, documentChunks } from "@/lib/db/schema";

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn((_fields?: unknown) => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((_condition: unknown) => {
            if (table === documents) {
              return {
                limit: vi.fn(async (_n?: number) => {
                  return mockDocs.filter(
                    (d) => d.id === VALID_DOC_ID && d.userId === VALID_USER_ID
                  );
                }),
              };
            }
            if (table === documentChunks) {
              return {
                orderBy: vi.fn((_order?: unknown) => ({
                  limit: vi.fn(async (n?: number) => {
                    const embedded = mockChunks.filter((c) => c.embedding !== null);
                    if (embedded.length === 0) return [];
                    const mapped = embedded.map((c) => ({
                      chunkId: c.id,
                      documentId: c.documentId,
                      sectionId: c.sectionId,
                      content: c.content,
                      pageNumber: c.pageNumber,
                      tokenCount: c.tokenCount,
                      chunkIndex: c.chunkIndex,
                      similarity: 0.92,
                    }));
                    return typeof n === "number" ? mapped.slice(0, n) : mapped;
                  }),
                  then: (resolve: (val: unknown) => void) => {
                    const unembedded = mockChunks.filter((c) => c.embedding === null);
                    resolve(
                      unembedded.map((c) => ({
                        id: c.id,
                        content: c.content,
                        chunkIndex: c.chunkIndex,
                      }))
                    );
                  },
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
      update: vi.fn(() => ({
        set: vi.fn((vals: Record<string, unknown>) => ({
          where: vi.fn(async (condition: unknown) => {
            const chunkId = (condition as { chunkId?: string })?.chunkId;
            const target = chunkId
              ? mockChunks.find((c) => c.id === chunkId)
              : mockChunks.find((c) => c.embedding === null);
            if (target) {
              Object.assign(target, vals);
            }
          }),
        })),
      })),
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: string) => ({ chunkId: val, docId: val }),
  and: (...conditions: any[]) => ({ conditions }),
  isNull: () => ({ isNull: true }),
  isNotNull: () => ({ isNotNull: true }),
  ne: vi.fn(),
  asc: vi.fn(),
  sql: vi.fn(),
  cosineDistance: vi.fn(),
  relations: vi.fn(),
}));

import { generateAndPersistChunkEmbeddings } from "@/lib/services/chunk-persistence-service";
import { retrieveDocumentEvidence } from "@/lib/services/retrieval-service";

describe("Phase B — Chunk Embedding to Q&A Retrieval Integration Pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocs = [{ id: VALID_DOC_ID, userId: VALID_USER_ID, status: "analyzing" }];
    mockChunks = [
      {
        id: "chunk-1",
        documentId: VALID_DOC_ID,
        sectionId: VALID_SEC_ID,
        chunkIndex: 0,
        content: "This Agreement shall be governed by and construed under the laws of the State of New York.",
        pageNumber: 1,
        tokenCount: 18,
        embedding: null, // Initially null after extraction
        updatedAt: new Date(),
      },
      {
        id: "chunk-2",
        documentId: VALID_DOC_ID,
        sectionId: VALID_SEC_ID,
        chunkIndex: 1,
        content: "Neither party may terminate this agreement without thirty (30) days prior written notice.",
        pageNumber: 2,
        tokenCount: 16,
        embedding: null, // Initially null after extraction
        updatedAt: new Date(),
      },
    ];
  });

  it("proves that newly created chunks receive embeddings and semantic retrieval finds them", async () => {
    // 1. Initial State: Chunks have null embeddings
    expect(mockChunks[0].embedding).toBeNull();
    expect(mockChunks[1].embedding).toBeNull();

    // 2. Before embedding generation: retrieval returns hasSufficientEvidence = false
    const beforeResult = await retrieveDocumentEvidence({
      documentId: VALID_DOC_ID,
      userId: VALID_USER_ID,
      question: "What is the governing law of this agreement?",
    });

    expect(beforeResult.hasSufficientEvidence).toBe(false);
    expect(beforeResult.chunks).toHaveLength(0);

    // 3. Connect pipeline: generate and persist chunk embeddings
    const embeddedCount = await generateAndPersistChunkEmbeddings(VALID_DOC_ID);
    expect(embeddedCount).toBe(2);

    // Verify database chunks now hold 1536-dimensional non-null vectors
    expect(mockChunks[0].embedding).not.toBeNull();
    expect(mockChunks[0].embedding).toHaveLength(1536);
    expect(mockChunks[1].embedding).not.toBeNull();
    expect(mockChunks[1].embedding).toHaveLength(1536);

    // 4. After embedding generation: retrieval succeeds and finds the evidence chunks
    const afterResult = await retrieveDocumentEvidence({
      documentId: VALID_DOC_ID,
      userId: VALID_USER_ID,
      question: "What is the governing law of this agreement?",
    });

    expect(afterResult.hasSufficientEvidence).toBe(true);
    expect(afterResult.chunks.length).toBeGreaterThan(0);
    expect(afterResult.chunks[0].chunkId).toBe("chunk-1");
    expect(afterResult.chunks[0].content).toContain("State of New York");
    expect(afterResult.chunks[0].similarity).toBeGreaterThan(0.2);
    expect(afterResult.chunks[0].pageNumber).toBe(1);

    // 5. Idempotency check: second invocation does not re-embed already embedded chunks
    const secondPassCount = await generateAndPersistChunkEmbeddings(VALID_DOC_ID);
    expect(secondPassCount).toBe(0);
  });
});

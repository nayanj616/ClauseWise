/**
 * Chunk Persistence Domain Service — ClauseWise
 *
 * Persists and manages document chunks in PostgreSQL via Drizzle ORM.
 *
 * Responsibilities:
 * - Stores deterministic chunks into document_chunks
 * - Supports participating in existing database transactions
 * - Reprocessing idempotency: deletes existing chunks before inserting new ones
 * - Queries document chunks ordered by chunkIndex ASC
 * - Validates input structures and UUID formats
 * - Sanitizes database errors to prevent sensitive leakage
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import {
  documentChunks,
  type DocumentChunk,
} from "@/lib/db/schema";
import type { GeneratedChunk } from "./chunking-service";

export type DbClient = Db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ChunkPersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ChunkPersistenceError";
  }
}

/**
 * Validates that an ID is a valid UUID string.
 */
function assertValidId(id: string, label: string): void {
  if (!id || typeof id !== "string" || !UUID_REGEX.test(id.trim())) {
    throw new ChunkPersistenceError(`Invalid ${label} provided: ${id}`);
  }
}

/**
 * Deletes all chunks associated with a specific document.
 * Used during reprocessing to prevent stale or duplicate chunks.
 *
 * @param documentId - UUID of the document
 * @param tx - Optional transaction client or default db
 */
export async function deleteDocumentChunks(
  documentId: string,
  tx: DbClient = db
): Promise<void> {
  assertValidId(documentId, "document ID");
  const cleanDocId = documentId.trim();

  try {
    await tx
      .delete(documentChunks)
      .where(eq(documentChunks.documentId, cleanDocId));
  } catch (error) {
    throw new ChunkPersistenceError(
      `Failed to delete chunks for document ${cleanDocId}`,
      { cause: error }
    );
  }
}

/**
 * Persists an array of generated chunks into document_chunks.
 *
 * @param chunks - Array of generated chunks produced by chunkSections
 * @param tx - Optional transaction client or default db
 * @returns Persisted DocumentChunk records
 */
export async function persistDocumentChunks(
  chunks: GeneratedChunk[],
  tx: DbClient = db
): Promise<DocumentChunk[]> {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return [];
  }

  // Validate chunk structures
  for (const chunk of chunks) {
    assertValidId(chunk.documentId, "document ID in chunk");
    assertValidId(chunk.sectionId, "section ID in chunk");

    if (typeof chunk.chunkIndex !== "number" || chunk.chunkIndex < 0) {
      throw new ChunkPersistenceError(
        `Invalid chunkIndex in chunk: ${chunk.chunkIndex}`
      );
    }

    if (!chunk.content || !chunk.content.trim()) {
      throw new ChunkPersistenceError("Chunk content must not be empty");
    }
  }

  try {
    const chunkRows = chunks.map((chunk) => ({
      documentId: chunk.documentId,
      sectionId: chunk.sectionId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      pageNumber: typeof chunk.pageNumber === "number" ? chunk.pageNumber : null,
      tokenCount: typeof chunk.tokenCount === "number" ? chunk.tokenCount : null,
    }));

    const inserted = await tx
      .insert(documentChunks)
      .values(chunkRows)
      .returning();

    return inserted;
  } catch (error) {
    throw new ChunkPersistenceError(
      "Failed to insert document chunks into database",
      { cause: error }
    );
  }
}

/**
 * Retrieves all chunks for a document, ordered deterministically by chunkIndex ASC.
 *
 * @param documentId - UUID of the document
 * @param tx - Optional transaction client or default db
 * @returns Array of DocumentChunk records
 */
export async function getDocumentChunks(
  documentId: string,
  tx: DbClient = db
): Promise<DocumentChunk[]> {
  assertValidId(documentId, "document ID");
  const cleanDocId = documentId.trim();

  try {
    const chunks = await tx
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, cleanDocId))
      .orderBy(asc(documentChunks.chunkIndex));

    return chunks;
  } catch (error) {
    throw new ChunkPersistenceError(
      `Failed to retrieve chunks for document ${cleanDocId}`,
      { cause: error }
    );
  }
}

/**
 * Generates embeddings for all unembedded chunks of a document via embedBatch()
 * and updates document_chunks with the resulting 1536-dimensional vectors.
 *
 * @param documentId - UUID of the target document
 * @param tx - Optional transaction client or default db
 * @returns Number of chunks successfully embedded
 */
export async function generateAndPersistChunkEmbeddings(
  documentId: string,
  tx: DbClient = db
): Promise<number> {
  assertValidId(documentId, "document ID");
  const cleanDocId = documentId.trim();

  try {
    // 1. Fetch chunks needing embeddings, ordered by chunkIndex ASC
    const chunks = await tx
      .select({ id: documentChunks.id, content: documentChunks.content })
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, cleanDocId),
          isNull(documentChunks.embedding)
        )
      )
      .orderBy(asc(documentChunks.chunkIndex));

    if (chunks.length === 0) {
      return 0;
    }

    // 2. Generate embeddings in batches of up to 100
    const { embedBatch } = await import("@/lib/embeddings/embeddings-client");
    const BATCH_SIZE = 100;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const chunkBatch = chunks.slice(i, i + BATCH_SIZE);
      const texts = chunkBatch.map((c) => c.content);
      const embeddings = await embedBatch(texts);

      if (embeddings.length !== chunkBatch.length) {
        throw new ChunkPersistenceError(
          `Embedding batch count mismatch: expected ${chunkBatch.length}, received ${embeddings.length}`
        );
      }

      // 3. Persist embeddings into document_chunks
      await Promise.all(
        chunkBatch.map((chunk, idx) =>
          tx
            .update(documentChunks)
            .set({
              embedding: embeddings[idx],
              updatedAt: new Date(),
            })
            .where(eq(documentChunks.id, chunk.id))
        )
      );
    }

    return chunks.length;
  } catch (error) {
    if (error instanceof ChunkPersistenceError) {
      throw error;
    }
    throw new ChunkPersistenceError(
      `Failed to generate and persist embeddings for document ${cleanDocId}`,
      { cause: error }
    );
  }
}


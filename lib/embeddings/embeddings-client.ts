/**
 * Embeddings client boundary — ClauseWise
 *
 * SERVER-SIDE ONLY — wraps local Ollama (`nomic-embed-text`, 768d) as the
 * primary embedding provider for the `vector(768)` schema.
 *
 * Dimension Invariant (Option A — vector(768)):
 * - `document_chunks.embedding` in PostgreSQL is `vector(768)`.
 * - All embedding generation and retrieval paths MUST produce 768-dimensional vectors.
 * - While the active schema column is `vector(768)`, the application will NOT attempt
 *   to call OpenAI embeddings or allow 1,536-dimensional OpenAI vectors into the pipeline
 *   (`EmbeddingDimensionError` is thrown before any OpenAI embeddings API request).
 */
import {
  OLLAMA_EMBEDDING_DIMENSIONS,
  embedBatchWithOllama,
  embedTextWithOllama,
} from "@/lib/ai/ollama-client";

/** Native dimensionality of OpenAI text-embedding-3-small */
export const OPENAI_EMBEDDING_DIMENSIONS = 1536 as const;

/** Active schema dimensionality (`vector(768)` in `document_chunks.embedding`) */
export const EMBEDDING_DIMENSIONS = OLLAMA_EMBEDDING_DIMENSIONS;

export { OLLAMA_EMBEDDING_DIMENSIONS };

export type EmbeddingProvider = "openai" | "ollama";

export class EmbeddingDimensionError extends Error {
  readonly expectedDimensions: number;
  readonly actualDimensions: number;

  constructor(expectedDimensions: number, actualDimensions: number) {
    super(
      `[clausewise] Embedding dimension mismatch: active vector(${expectedDimensions}) schema requires ${expectedDimensions} dimensions, but received ${actualDimensions} dimensions. 1,536-dimensional OpenAI embeddings cannot be written into a 768-dimensional column.`
    );
    this.name = "EmbeddingDimensionError";
    this.expectedDimensions = expectedDimensions;
    this.actualDimensions = actualDimensions;
  }
}

/**
 * Validates that an embedding vector strictly matches the active schema dimension (768).
 */
export function assertValidEmbeddingDimensions(
  vector: number[],
  expectedDimensions: number = EMBEDDING_DIMENSIONS
): void {
  if (!Array.isArray(vector) || vector.length !== expectedDimensions) {
    throw new EmbeddingDimensionError(
      expectedDimensions,
      Array.isArray(vector) ? vector.length : 0
    );
  }
}

/**
 * Resolves the active embedding provider.
 * Defaults to "ollama" (`nomic-embed-text`, 768d) to match the `vector(768)` database schema.
 */
export function getActiveEmbeddingProvider(): EmbeddingProvider {
  const explicit = (process.env.EMBEDDING_PROVIDER || "").trim().toLowerCase();
  if (explicit === "openai") return "openai";
  if (explicit === "ollama") return "ollama";
  return "ollama";
}

/**
 * Returns the active database embedding dimension (768).
 */
export function getActiveEmbeddingDimensions(): 768 {
  return EMBEDDING_DIMENSIONS;
}

/**
 * Embeds a single text string and validates that the returned vector is 768-dimensional.
 * Blocks any attempt to use 1,536-dimensional OpenAI embeddings before making a network call.
 *
 * @param text - The text to embed
 * @returns 768-dimensional float vector
 */
export async function embedText(text: string): Promise<number[]> {
  if (getActiveEmbeddingProvider() !== "ollama") {
    throw new EmbeddingDimensionError(
      EMBEDDING_DIMENSIONS,
      OPENAI_EMBEDDING_DIMENSIONS
    );
  }

  const vec = await embedTextWithOllama(text, {
    expectedDimensions: EMBEDDING_DIMENSIONS,
  });
  assertValidEmbeddingDimensions(vec, EMBEDDING_DIMENSIONS);
  return vec;
}

/**
 * Embeds multiple texts in a single API call and validates that every vector is 768-dimensional.
 * Blocks any attempt to use 1,536-dimensional OpenAI embeddings before making a network call.
 *
 * @param texts - Array of texts to embed
 * @returns Array of 768-dimensional float arrays in the same order as input
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (getActiveEmbeddingProvider() !== "ollama") {
    throw new EmbeddingDimensionError(
      EMBEDDING_DIMENSIONS,
      OPENAI_EMBEDDING_DIMENSIONS
    );
  }

  const vectors = await embedBatchWithOllama(texts, {
    expectedDimensions: EMBEDDING_DIMENSIONS,
  });
  for (const vec of vectors) {
    assertValidEmbeddingDimensions(vec, EMBEDDING_DIMENSIONS);
  }
  return vectors;
}


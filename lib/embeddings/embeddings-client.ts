/**
 * Embeddings client boundary — ClauseWise
 *
 * SERVER-SIDE ONLY — wraps OpenAI (`text-embedding-3-small`, 1536d) and
 * local Ollama (`nomic-embed-text`, 768d) embedding providers.
 *
 * Provider selection:
 * - Controlled via `EMBEDDING_PROVIDER` ("openai" | "ollama").
 * - Defaults to "openai" (1536 dimensions) while `document_chunks.embedding`
 *   in PostgreSQL is defined as `vector(1536)`.
 * - When `EMBEDDING_PROVIDER="ollama"`, delegates to `nomic-embed-text` (768 dimensions).
 */
import { openaiClient, MODELS } from "@/lib/ai/openai-client";
import {
  OLLAMA_EMBEDDING_DIMENSIONS,
  embedBatchWithOllama,
  embedTextWithOllama,
} from "@/lib/ai/ollama-client";

/** Dimensionality of OpenAI text-embedding-3-small — matches vector(1536) in current schema */
export const OPENAI_EMBEDDING_DIMENSIONS = 1536 as const;

/** Dimensionality of active default schema vector(1536) */
export const EMBEDDING_DIMENSIONS = OPENAI_EMBEDDING_DIMENSIONS;

export { OLLAMA_EMBEDDING_DIMENSIONS };

export type EmbeddingProvider = "openai" | "ollama";

/**
 * Resolves the active embedding provider.
 * Defaults to "openai" to match the active `vector(1536)` database column unless
 * `EMBEDDING_PROVIDER="ollama"` is explicitly configured.
 */
export function getActiveEmbeddingProvider(): EmbeddingProvider {
  const explicit = (process.env.EMBEDDING_PROVIDER || "").trim().toLowerCase();
  if (explicit === "ollama") return "ollama";
  if (explicit === "openai") return "openai";
  return "openai";
}

/**
 * Returns the expected vector dimensions for the currently active embedding provider.
 */
export function getActiveEmbeddingDimensions(): 1536 | 768 {
  return getActiveEmbeddingProvider() === "ollama"
    ? OLLAMA_EMBEDDING_DIMENSIONS
    : OPENAI_EMBEDDING_DIMENSIONS;
}

/**
 * Embeds a single text string and returns the embedding vector.
 *
 * @param text - The text to embed
 * @returns Float vector (1536d for OpenAI text-embedding-3-small, 768d for Ollama nomic-embed-text)
 */
export async function embedText(text: string): Promise<number[]> {
  if (getActiveEmbeddingProvider() === "ollama") {
    return embedTextWithOllama(text);
  }

  const response = await openaiClient.embeddings.create({
    model: MODELS.EMBEDDINGS,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error("[clausewise] OpenAI returned an empty embedding response");
  }

  return embedding;
}

/**
 * Embeds multiple texts in a single API call (batch embedding).
 *
 * @param texts - Array of texts to embed
 * @returns Array of float vectors in the same order as input
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (getActiveEmbeddingProvider() === "ollama") {
    return embedBatchWithOllama(texts);
  }

  const response = await openaiClient.embeddings.create({
    model: MODELS.EMBEDDINGS,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

/**
 * Embeddings client boundary — ClauseWise
 *
 * SERVER-SIDE ONLY — wraps the OpenAI embeddings API.
 *
 * Phase 3 will call embedText() during document processing to generate
 * chunk embeddings stored in pgvector. This module is the single point
 * where embedding model configuration lives.
 *
 * Do not implement embedding calls here in Phase 0 — this is the
 * boundary definition only.
 */
import { openaiClient, MODELS } from "@/lib/ai/openai-client";

/** Dimensionality of text-embedding-3-small — matches vector(1536) in schema */
export const EMBEDDING_DIMENSIONS = 1536 as const;

/**
 * Embeds a single text string and returns the embedding vector.
 * Phase 3 implementation — stub only in Phase 0.
 *
 * @param text - The text to embed (max ~8191 tokens for text-embedding-3-small)
 * @returns A 1536-dimensional float array
 */
export async function embedText(text: string): Promise<number[]> {
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
 * More efficient than calling embedText() in a loop.
 * Phase 3 implementation.
 *
 * @param texts - Array of texts to embed (same token limit per item)
 * @returns Array of 1536-dimensional float arrays, same order as input
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await openaiClient.embeddings.create({
    model: MODELS.EMBEDDINGS,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}


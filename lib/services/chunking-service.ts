/**
 * Chunking Domain Service — ClauseWise
 *
 * Deterministically transforms persisted document sections into retrieval-ready chunks.
 *
 * Responsibilities:
 * - Deterministic, section-aware text segmentation
 * - Preserves section boundaries (never crosses section boundaries)
 * - Preserves paragraph boundaries where practical, falling back to sentences and words
 * - Strictly avoids splitting text mid-word (unless a single unbroken token exceeds maxChunkChars)
 * - Preserves all substantive extracted text (boundary whitespace normalized)
 * - Format-agnostic page reference propagation (propagates section.pageStart ?? null)
 * - Calculates approximate tokenCount metadata (Math.ceil(length / 4))
 * - Assigns globally sequential, zero-based chunkIndex across the entire document
 * - Defensive against empty or whitespace-only sections (produces 0 chunks)
 *
 * SERVER-SIDE / PURE DOMAIN ONLY — zero database, storage, or network dependencies.
 */

export interface ChunkingConfig {
  /** Maximum chunk size in characters. Default: 1500 (~350–400 words / ~450 tokens). */
  maxChunkChars?: number;
}

export const DEFAULT_MAX_CHUNK_CHARS = 1500;

/**
 * Minimal representation of a document section required for chunking.
 */
export interface ChunkInputSection {
  id: string;
  documentId: string;
  content: string;
  orderIndex: number;
  pageStart?: number | null;
  pageEnd?: number | null;
}

/**
 * Output data structure of a deterministic chunk generated from a section.
 */
export interface GeneratedChunk {
  documentId: string;
  sectionId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  characterCount: number;
  /**
   * Approximate token count heuristic: Math.ceil(characterCount / 4).
   * NOTE: Approximate metadata only; must NOT be used for enforcing model token limits.
   */
  tokenCount: number;
}

/**
 * Splits an excessively long paragraph (exceeding maxChunkChars) into smaller segments
 * while preserving sentence boundaries and word boundaries.
 */
function splitLargeParagraph(paragraph: string, maxChunkChars: number): string[] {
  const trimmed = paragraph.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChunkChars) return [trimmed];

  // 1. Split on sentence boundaries: positive lookbehind for terminal punctuation followed by space
  const sentenceRegex = /(?<=[.!?])\s+/;
  const rawSentences = trimmed.split(sentenceRegex).map((s) => s.trim()).filter(Boolean);

  const segments: string[] = [];
  let currentSentenceBuffer = "";

  for (const sentence of rawSentences) {
    if (sentence.length <= maxChunkChars) {
      if (!currentSentenceBuffer) {
        currentSentenceBuffer = sentence;
      } else if (currentSentenceBuffer.length + 1 + sentence.length <= maxChunkChars) {
        currentSentenceBuffer += " " + sentence;
      } else {
        segments.push(currentSentenceBuffer);
        currentSentenceBuffer = sentence;
      }
    } else {
      // Individual sentence itself exceeds maxChunkChars: split on word boundaries
      if (currentSentenceBuffer) {
        segments.push(currentSentenceBuffer);
        currentSentenceBuffer = "";
      }

      const words = sentence.split(/\s+/).filter(Boolean);
      let wordBuffer = "";

      for (const word of words) {
        if (word.length <= maxChunkChars) {
          if (!wordBuffer) {
            wordBuffer = word;
          } else if (wordBuffer.length + 1 + word.length <= maxChunkChars) {
            wordBuffer += " " + word;
          } else {
            segments.push(wordBuffer);
            wordBuffer = word;
          }
        } else {
          // Pathological edge case: single unbroken word/token exceeds maxChunkChars
          if (wordBuffer) {
            segments.push(wordBuffer);
            wordBuffer = "";
          }

          // Slice deterministically at maxChunkChars so bounded size is preserved without dropping characters
          let remainingWord = word;
          while (remainingWord.length > maxChunkChars) {
            segments.push(remainingWord.slice(0, maxChunkChars));
            remainingWord = remainingWord.slice(maxChunkChars);
          }
          if (remainingWord) {
            wordBuffer = remainingWord;
          }
        }
      }

      if (wordBuffer) {
        segments.push(wordBuffer);
      }
    }
  }

  if (currentSentenceBuffer) {
    segments.push(currentSentenceBuffer);
  }

  return segments;
}

/**
 * Deterministically chunks a single section into bounded chunks.
 *
 * Rules:
 * 1. Preserves section boundaries (never crosses section boundaries)
 * 2. Empty or whitespace-only content yields 0 chunks
 * 3. Short sections (length <= maxChunkChars) yield 1 chunk
 * 4. Long sections split first on paragraph boundaries (\n\s*\n), then sentence/word boundaries
 * 5. Format-agnostic page propagation: section.pageStart ?? null
 * 6. Substantive extracted text is preserved; boundary whitespace is normalized
 *
 * @param section - Persisted or inserted section record
 * @param startingIndex - 0-indexed sequence counter to start chunkIndex from
 * @param config - Optional chunking configuration
 * @returns Array of generated chunks for this section
 */
export function chunkSection(
  section: ChunkInputSection,
  startingIndex: number,
  config?: ChunkingConfig
): GeneratedChunk[] {
  const maxChunkChars = config?.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;

  const rawContent = section.content ?? "";
  const normalizedContent = rawContent
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  // Defensive: empty or whitespace-only sections produce no meaningless empty chunks
  if (!normalizedContent) {
    return [];
  }

  const pageNumber =
    typeof section.pageStart === "number" ? section.pageStart : null;

  // Short section fits within the maximum chunk size: emit a single chunk
  if (normalizedContent.length <= maxChunkChars) {
    return [
      {
        documentId: section.documentId,
        sectionId: section.id,
        chunkIndex: startingIndex,
        content: normalizedContent,
        pageNumber,
        characterCount: normalizedContent.length,
        tokenCount: Math.ceil(normalizedContent.length / 4),
      },
    ];
  }

  // Long section: split on paragraph boundaries (\n\s*\n)
  const paragraphBlocks = normalizedContent
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunkTexts: string[] = [];
  let currentBuffer = "";

  for (const block of paragraphBlocks) {
    if (block.length <= maxChunkChars) {
      if (!currentBuffer) {
        currentBuffer = block;
      } else if (currentBuffer.length + 2 + block.length <= maxChunkChars) {
        // Separate accumulated paragraphs with double newlines
        currentBuffer += "\n\n" + block;
      } else {
        chunkTexts.push(currentBuffer);
        currentBuffer = block;
      }
    } else {
      // Paragraph itself exceeds maxChunkChars: flush existing buffer and split paragraph
      if (currentBuffer) {
        chunkTexts.push(currentBuffer);
        currentBuffer = "";
      }

      const subSegments = splitLargeParagraph(block, maxChunkChars);
      for (const seg of subSegments) {
        if (!currentBuffer) {
          currentBuffer = seg;
        } else if (currentBuffer.length + 2 + seg.length <= maxChunkChars) {
          currentBuffer += "\n\n" + seg;
        } else {
          chunkTexts.push(currentBuffer);
          currentBuffer = seg;
        }
      }
    }
  }

  if (currentBuffer) {
    chunkTexts.push(currentBuffer);
  }

  return chunkTexts.map((text, i) => ({
    documentId: section.documentId,
    sectionId: section.id,
    chunkIndex: startingIndex + i,
    content: text,
    pageNumber,
    characterCount: text.length,
    tokenCount: Math.ceil(text.length / 4),
  }));
}

/**
 * Deterministically chunks an array of sections in sequence.
 *
 * Each chunk receives a globally sequential chunkIndex starting at 0 and incrementing
 * across the entire document's sections.
 *
 * @param sections - Array of sections ordered by orderIndex
 * @param config - Optional chunking configuration
 * @returns Array of generated chunks for the entire document
 */
export function chunkSections(
  sections: ChunkInputSection[],
  config?: ChunkingConfig
): GeneratedChunk[] {
  const allChunks: GeneratedChunk[] = [];
  let nextChunkIndex = 0;

  for (const section of sections) {
    const sectionChunks = chunkSection(section, nextChunkIndex, config);
    allChunks.push(...sectionChunks);
    nextChunkIndex += sectionChunks.length;
  }

  return allChunks;
}

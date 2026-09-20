/**
 * Document Extraction Types — ClauseWise
 *
 * Explicit TypeScript types representing document extraction results,
 * page boundaries, detected sections, and extraction input options.
 *
 * Designed to provide the factual foundation for subsequent AI analysis
 * and database persistence without inventing document semantics.
 */

export const SUPPORTED_DOCUMENT_FORMATS = ["pdf", "docx", "txt"] as const;
export type SupportedDocumentFormat = (typeof SUPPORTED_DOCUMENT_FORMATS)[number];

/**
 * A single page extracted from a document.
 * Only present for formats with native physical page boundaries (PDF).
 */
export interface ExtractedPage {
  /** 1-indexed page number */
  pageNumber: number;
  /** Raw text extracted from this page */
  text: string;
}

/**
 * A detected logical section or clause within the document.
 * Follows factual document markers (numbered clauses, headings, preambles).
 */
export interface ExtractedSection {
  /** 0-indexed sequence within the document */
  orderIndex: number;
  /** Section heading or descriptive label */
  title: string;
  /** Extracted text content for this section */
  text: string;
  /** 1-indexed starting page (PDF only) */
  pageStart?: number;
  /** 1-indexed ending page (PDF only) */
  pageEnd?: number;
}

/**
 * Summary metrics and metadata extracted from the document.
 */
export interface ExtractionMetadata {
  /** Total count of characters in extracted text */
  characterCount: number;
  /** Total count of words in extracted text */
  wordCount: number;
  /** Total count of lines in extracted text */
  lineCount: number;
  /** Total count of pages, if determinable */
  pageCount?: number;
  /** Format-specific metadata (e.g. PDF title/author, if present) */
  info?: Record<string, unknown>;
}

/**
 * Authoritative structured result returned by the extraction service.
 * Holds all data needed for downstream section persistence and AI chunking.
 */
export interface DocumentExtractionResult {
  /** Full extracted text content of the document */
  text: string;
  /** Canonical document format */
  format: SupportedDocumentFormat;
  /** Page-by-page text. Undefined for TXT and DOCX where true pages do not exist. */
  pages?: ExtractedPage[];
  /** Total page count. Undefined for TXT and DOCX. */
  pageCount?: number;
  /** Sequentially ordered sections extracted from the document */
  sections: ExtractedSection[];
  /** Extraction metrics and metadata */
  metadata: ExtractionMetadata;
}

/**
 * Input options accepted by the extraction service.
 * Supports buffers, TypedArrays, or File-like objects alongside candidate hints.
 */
export interface ExtractionInput {
  /** Binary buffer of the document */
  buffer?: Buffer | Uint8Array | ArrayBuffer;
  /** Browser or Node File-like object with arrayBuffer() method */
  file?: {
    name?: string;
    type?: string;
    size?: number;
    arrayBuffer(): Promise<ArrayBuffer>;
  };
  /** MIME type hint (e.g. 'application/pdf', 'text/plain') */
  mimeType?: string;
  /** Filename hint (used to infer extension) */
  filename?: string;
  /** Explicit format override hint */
  format?: SupportedDocumentFormat;
}


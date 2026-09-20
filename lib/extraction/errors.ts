/**
 * Document Extraction Errors — ClauseWise
 *
 * Strongly-typed error hierarchy for document extraction.
 * Every error carries a machine-readable code and a sanitized,
 * user-safe message suitable for displaying in the UI without
 * exposing stack traces or server internals.
 */

export const ExtractionErrorCode = {
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  MALFORMED_FILE: "MALFORMED_FILE",
  UNREADABLE_FILE: "UNREADABLE_FILE",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  EMPTY_CONTENT: "EMPTY_CONTENT",
} as const;

export type ExtractionErrorCode =
  (typeof ExtractionErrorCode)[keyof typeof ExtractionErrorCode];

/**
 * Base class for all document extraction errors.
 */
export class DocumentExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  readonly userMessage: string;

  constructor(
    internalMessage: string,
    code: ExtractionErrorCode,
    userMessage: string,
    options?: { cause?: unknown }
  ) {
    super(internalMessage, options);
    this.name = "DocumentExtractionError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

/**
 * Thrown when the document format is not supported (not PDF, DOCX, or TXT).
 */
export class UnsupportedFormatError extends DocumentExtractionError {
  constructor(formatOrMime?: string, options?: { cause?: unknown }) {
    super(
      `Unsupported document format: ${formatOrMime ?? "unknown"}`,
      ExtractionErrorCode.UNSUPPORTED_FORMAT,
      "The provided file format is not supported. Please upload a PDF, DOCX, or TXT document.",
      options
    );
    this.name = "UnsupportedFormatError";
  }
}

/**
 * Thrown when the file content is corrupt, has an invalid structure,
 * or when an explicit format hint conflicts with detectable file signatures.
 */
export class MalformedDocumentError extends DocumentExtractionError {
  constructor(reason: string, options?: { cause?: unknown }) {
    super(
      `Malformed document: ${reason}`,
      ExtractionErrorCode.MALFORMED_FILE,
      "The document appears to be corrupted or malformed and could not be read.",
      options
    );
    this.name = "MalformedDocumentError";
  }
}

/**
 * Thrown when the document content cannot be read or decoded (e.g. invalid encoding,
 * disguised binary).
 */
export class UnreadableDocumentError extends DocumentExtractionError {
  constructor(reason: string, options?: { cause?: unknown }) {
    super(
      `Unreadable document: ${reason}`,
      ExtractionErrorCode.UNREADABLE_FILE,
      "The document content could not be read. Please ensure the file contains valid text.",
      options
    );
    this.name = "UnreadableDocumentError";
  }
}

/**
 * Thrown when the underlying extraction library encounters an unrecoverable failure.
 */
export class ExtractionFailedError extends DocumentExtractionError {
  constructor(reason: string, options?: { cause?: unknown }) {
    super(
      `Document extraction failed: ${reason}`,
      ExtractionErrorCode.EXTRACTION_FAILED,
      "An unexpected error occurred while extracting text from the document.",
      options
    );
    this.name = "ExtractionFailedError";
  }
}

/**
 * Thrown when the document has 0 bytes or the extracted text is empty or purely whitespace.
 */
export class EmptyContentError extends DocumentExtractionError {
  constructor(options?: { cause?: unknown }) {
    super(
      "Extracted content is empty",
      ExtractionErrorCode.EMPTY_CONTENT,
      "No readable text could be extracted from the document. The file may be empty or contain only non-text elements.",
      options
    );
    this.name = "EmptyContentError";
  }
}


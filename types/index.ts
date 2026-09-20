/**
 * Shared domain types — ClauseWise
 *
 * These types are derived from the conceptual data model in docs/DATA_MODEL.md.
 * Drizzle inferred types (User, Document, etc.) are re-exported from
 * lib/db/schema.ts and should be used directly in service functions.
 * This file holds types for API responses, service return shapes, and
 * UI-facing data that cross the server/client boundary.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Shape returned to the client after a server action that touches auth. */
export interface ActionResult {
  error?: string;
  success?: boolean;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export type { Document, DocumentStatus } from "@/lib/db/schema";

/** Human-readable labels for document status values */
export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  extracting: "Extracting…",
  extracted: "Extracted",
  chunking: "Processing…",
  analyzing: "Analyzing…",
  ready: "Ready",
  error: "Error",
} as const;

// ---------------------------------------------------------------------------
// API error shape
// ---------------------------------------------------------------------------

/** Standard error response body for all Route Handlers. */
export interface ApiError {
  error: string;
  /** Only included in development */
  detail?: string;
}

// ---------------------------------------------------------------------------
// Document Extraction (Phase 2)
// ---------------------------------------------------------------------------

export type {
  SupportedDocumentFormat,
  ExtractedPage,
  ExtractedSection,
  ExtractionMetadata,
  DocumentExtractionResult,
  ExtractionInput,
} from "@/lib/extraction/types";

export {
  SUPPORTED_DOCUMENT_FORMATS,
} from "@/lib/extraction/types";

export {
  ExtractionErrorCode,
  DocumentExtractionError,
  UnsupportedFormatError,
  MalformedDocumentError,
  UnreadableDocumentError,
  ExtractionFailedError,
  EmptyContentError,
} from "@/lib/extraction/errors";



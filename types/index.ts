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

export type {
  Document,
  DocumentStatus,
  DocumentSection,
  NewDocumentSection,
  DocumentChunk,
  NewDocumentChunk,
  DocumentFinding,
  NewDocumentFinding,
  FindingType,
  FindingImportance,
  FINDING_TYPES,
  FINDING_IMPORTANCE,
} from "@/lib/db/schema";
export type {
  WorkspaceDocument,
  WorkspaceSection,
  DocumentWorkspaceData,
} from "@/lib/services/document-service";
export type {
  ChunkingConfig,
  ChunkInputSection,
  GeneratedChunk,
} from "@/lib/services/chunking-service";
export { DEFAULT_MAX_CHUNK_CHARS } from "@/lib/services/chunking-service";

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

// ---------------------------------------------------------------------------
// Document Intelligence (Phase 3)
// ---------------------------------------------------------------------------

export type {
  IntelligenceInputSection,
  IntelligenceInputChunk,
  IntelligenceInputPayload,
  InputBoundingMetadata,
  ValidatedFinding,
  ValidatedParty,
  ValidatedGoverningLaw,
  ValidatedJurisdiction,
  ValidatedImportantSection,
  ValidatedClassification,
  ValidatedDate,
  ValidatedFinancialTerm,
  ValidatedIntelligenceResult,
  RawAiIntelligenceResponse,
  RawAiFinding,
  SubstantiveAiFinding,
  MissingInfoAiFinding,
} from "@/lib/intelligence/types";

export {
  FindingTypeSchema,
  SubstantiveFindingTypeSchema,
  FindingImportanceSchema,
  RawAiFindingSchema,
  SubstantiveAiFindingSchema,
  MissingInfoAiFindingSchema,
  RawAiPartySchema,
  RawAiGoverningLawSchema,
  RawAiJurisdictionSchema,
  RawAiImportantSectionSchema,
  RawAiClassificationSchema,
  RawAiIntelligenceResponseSchema,
} from "@/lib/intelligence/schemas";

export {
  CORE_PROVISION_CATALOG,
  getAllowableExpectedTopics,
  isExpectedTopicAllowed,
} from "@/lib/intelligence/expectation-catalog";

export type { IntelligencePersistenceResult } from "@/lib/services/intelligence-persistence-service";

// ---------------------------------------------------------------------------
// Document Retrieval (Phase 4)
// ---------------------------------------------------------------------------

export type { FindingWithEvidence } from "@/lib/services/retrieval-service";

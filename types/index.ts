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
import type { DocumentStatus } from "@/lib/db/schema";

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
export type {
  HighlightRange,
  HighlightSegments,
} from "@/lib/workspace/highlight";

// ---------------------------------------------------------------------------
// Document Q&A (Phase 5)
// ---------------------------------------------------------------------------

export type {
  RetrievalConfig,
  RetrievalResult,
  RetrievedChunk,
} from "@/lib/services/retrieval-service";

export type {
  AnswerQuestionInput,
  AnswerQuestionResult,
  QaCitation,
  ModelQaOutput,
  ConversationalTurn,
  QaStreamEvent,
  QaStreamEventStatus,
  QaStreamEventDelta,
  QaStreamEventComplete,
  QaStreamEventError,
} from "@/lib/services/qa-service";

export type {
  Conversation,
  NewConversation,
  Message,
  NewMessage,
  MessageRole,
} from "@/lib/db/schema";
export { MESSAGE_ROLES } from "@/lib/db/schema";

export type { ConversationSummary } from "@/lib/services/conversation-service";

// ---------------------------------------------------------------------------
// Action Center (Phase 7)
// ---------------------------------------------------------------------------

export type {
  Action,
  NewAction,
  ActionStatus,
} from "@/lib/db/schema";
export { ACTION_STATUSES } from "@/lib/db/schema";

export type {
  ActionWithDetails,
  CreateActionInput,
  UpdateActionStatusInput,
  ListActionsInput,
} from "@/lib/services/action-service";

// ---------------------------------------------------------------------------
// Professional Prep (Phase 8)
// ---------------------------------------------------------------------------

export type {
  KeyClauseItem,
  ClarificationQuestion,
  ProfessionalPrepData,
} from "@/lib/services/preparation-service";
export type { UserRecordedQuestion } from "@/lib/services/conversation-service";

// ---------------------------------------------------------------------------
// Document Comparison (Phase 9)
// ---------------------------------------------------------------------------

export type DifferenceType = "added" | "removed" | "modified" | "unchanged";

export interface MetadataDifference {
  field: "document_type" | "governing_law" | "jurisdiction" | "parties";
  label: string;
  valueA: string | null;
  valueB: string | null;
  isDifferent: boolean;
}

export interface SectionDifferenceItem {
  id: string;
  differenceType: DifferenceType;
  title: string;
  description: string;

  // Document A evidence
  sectionAId: string | null;
  sectionANumber: number | null;
  sectionATitle: string | null;
  sectionAPageStart: number | null;
  sectionAPageEnd: number | null;
  excerptA: string | null;
  findingAId?: string | null;

  // Document B evidence
  sectionBId: string | null;
  sectionBNumber: number | null;
  sectionBTitle: string | null;
  sectionBPageStart: number | null;
  sectionBPageEnd: number | null;
  excerptB: string | null;
  findingBId?: string | null;

  // Structural alignment context (neutral, not a quality or risk score)
  changeSummary?: string;
}

export interface DocumentComparisonSummary {
  totalDifferences: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
}

export interface DocumentComparisonResult {
  documentA: {
    id: string;
    title: string;
    filename: string;
    documentType: string | null;
    pageCount: number | null;
    governingLaw: string | null;
    jurisdiction: string | null;
    parties: Array<{ name: string; role: string | null }> | null;
  };
  documentB: {
    id: string;
    title: string;
    filename: string;
    documentType: string | null;
    pageCount: number | null;
    governingLaw: string | null;
    jurisdiction: string | null;
    parties: Array<{ name: string; role: string | null }> | null;
  };
  metadataDifferences: MetadataDifference[];
  differences: SectionDifferenceItem[];
  summary: DocumentComparisonSummary;
  comparedAt: Date;
}

export interface UserDocumentListItem {
  id: string;
  title: string;
  originalFilename: string | null;
  status: DocumentStatus;
  documentType: string | null;
  pageCount: number | null;
  createdAt: Date;
}

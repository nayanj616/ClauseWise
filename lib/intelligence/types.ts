/**
 * Shared Types for Document Intelligence — ClauseWise
 *
 * Defines the domain interfaces for intelligence inputs, verified outputs,
 * and evidence tracing records.
 */

import type {
  FindingType,
  FindingImportance,
  RawAiIntelligenceResponse,
  RawAiFinding,
  SubstantiveAiFinding,
  MissingInfoAiFinding,
  RawAiParty,
  RawAiGoverningLaw,
  RawAiJurisdiction,
  RawAiImportantSection,
  RawAiClassification,
  RawAiDate,
  RawAiFinancialTerm,
  RawAiStructuredExtraction,
  RawAiFindingsResponse,
} from "./schemas";

export type {
  FindingType,
  FindingImportance,
  RawAiIntelligenceResponse,
  RawAiFinding,
  RawAiFindingsResponse,
  SubstantiveAiFinding,
  MissingInfoAiFinding,
  RawAiParty,
  RawAiGoverningLaw,
  RawAiJurisdiction,
  RawAiImportantSection,
  RawAiClassification,
  RawAiDate,
  RawAiFinancialTerm,
  RawAiStructuredExtraction,
};

/** Minimal persisted section representation supplied as intelligence input */
export interface IntelligenceInputSection {
  id: string;
  orderIndex: number;
  title: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  documentId?: string;
}

/** Minimal persisted chunk representation supplied for RAG traceability */
export interface IntelligenceInputChunk {
  id: string;
  sectionId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  documentId?: string;
}

/** Complete input payload passed to the intelligence engine */
export interface IntelligenceInputPayload {
  documentId: string;
  filename: string;
  mimeType: string;
  pageCount: number | null;
  sections: IntelligenceInputSection[];
  chunks: IntelligenceInputChunk[];
}

/** Telemetry recorded when a document exceeds the input budget and is deterministically bounded */
export interface InputBoundingMetadata {
  wasBounded: boolean;
  totalSections: number;
  includedSections: number;
  totalCharacters: number;
}

/** Verified finding ready for database persistence */
export interface ValidatedFinding {
  documentId: string;
  sectionId: string | null;
  chunkId: string | null;
  findingType: FindingType;
  importance: FindingImportance;
  label: string;
  summary: string;
  sourceText: string | null;
  pageNumber: number | null;
  metadata: Record<string, unknown> | null;
}

/** Verified party with grounded evidence */
export interface ValidatedParty {
  name: string;
  role: string | null;
  sourceText: string;
  sectionId: string;
  sectionOrderIndex: number;
}

/** Verified governing law with grounded evidence */
export interface ValidatedGoverningLaw {
  law: string;
  sourceText: string;
  sectionId: string;
  sectionOrderIndex: number;
}

/** Verified jurisdiction with grounded evidence */
export interface ValidatedJurisdiction {
  jurisdiction: string;
  sourceText: string;
  sectionId: string;
  sectionOrderIndex: number;
}

/** Verified notable section with confirmed database reference */
export interface ValidatedImportantSection {
  sectionId: string;
  sectionOrderIndex: number;
  title: string;
  reason: string;
}

/** Verified document classification */
export interface ValidatedClassification {
  documentType: string;
  isStatedInText: boolean;
  sourceText: string | null;
  sectionId: string | null;
  sectionOrderIndex: number | null;
  inferenceReason: string | null;
}

/** Complete validated intelligence result passing all schema and evidence checks */
export interface ValidatedIntelligenceResult {
  documentId: string;
  classification: ValidatedClassification;
  parties: ValidatedParty[];
  governingLaw: ValidatedGoverningLaw | null;
  jurisdiction: ValidatedJurisdiction | null;
  executiveSummary: string;
  importantSections: ValidatedImportantSection[];
  findings: ValidatedFinding[];
  rejectedFindingsCount: number;
  inputBounding?: InputBoundingMetadata;
}

/** Verified important date with grounded evidence (Slice 3.3) */
export interface ValidatedDate {
  dateValue: string;
  dateType: string;
  description: string;
  sourceText: string;
  sectionId: string;
  sectionOrderIndex: number;
}

/** Verified financial term with grounded evidence (Slice 3.3) */
export interface ValidatedFinancialTerm {
  amount: string;
  currency: string | null;
  frequency: string | null;
  description: string;
  sourceText: string;
  sectionId: string;
  sectionOrderIndex: number;
}

/** Complete verified structured extraction result (Slice 3.3) */
export interface ValidatedStructuredExtraction {
  parties: ValidatedParty[];
  governingLaw: ValidatedGoverningLaw | null;
  jurisdiction: ValidatedJurisdiction | null;
  importantDates: ValidatedDate[];
  financialTerms: ValidatedFinancialTerm[];
  importantSections: ValidatedImportantSection[];
}



/**
 * Evidence Validation Domain Engine — ClauseWise
 *
 * Deterministically verifies AI outputs against persisted document sections and chunks.
 *
 * Contract Invariants:
 * 1. The LLM is never the source of truth.
 * 2. Every substantive finding must have verifiable sourceText in the referenced section.
 * 3. Parties, governing law, jurisdiction, and stated document type must be supported by text.
 * 4. missing_information findings must be grounded in the authoritative expectation catalog.
 * 5. Fabricated, ungrounded, or mismatched citations are rejected before persistence.
 *
 * PURE DOMAIN ENGINE — zero network, database, or external SDK dependencies.
 */

import type {
  IntelligenceInputPayload,
  IntelligenceInputSection,
  IntelligenceInputChunk,
  ValidatedIntelligenceResult,
  ValidatedFinding,
  ValidatedParty,
  ValidatedGoverningLaw,
  ValidatedJurisdiction,
  ValidatedImportantSection,
  ValidatedClassification,
  ValidatedDate,
  ValidatedFinancialTerm,
  ValidatedStructuredExtraction,
} from "./types";
import {
  type RawAiIntelligenceResponse,
  type RawAiClassification,
  type RawAiParty,
  type RawAiGoverningLaw,
  type RawAiJurisdiction,
  type RawAiImportantSection,
  type RawAiDate,
  type RawAiFinancialTerm,
  type RawAiStructuredExtraction,
  type RawAiFinding,
  SUPPORTED_DOCUMENT_TYPES,
  type SupportedDocumentType,
} from "./schemas";
import {
  isExpectedTopicAllowed,
  normalizeDocumentTypeKey,
} from "./expectation-catalog";

/**
 * Base error class for all evidence validation failures (Slice 3.5).
 */
export class EvidenceValidationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EvidenceValidationError";
  }
}

export class ClassificationEvidenceValidationError extends EvidenceValidationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClassificationEvidenceValidationError";
  }
}

export class StructuredExtractionValidationError extends EvidenceValidationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StructuredExtractionValidationError";
  }
}

export class FindingEvidenceValidationError extends EvidenceValidationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FindingEvidenceValidationError";
  }
}

export function isSupportedDocumentType(
  type: string | null | undefined
): type is SupportedDocumentType {
  if (!type || typeof type !== "string") return false;
  return (SUPPORTED_DOCUMENT_TYPES as readonly string[]).includes(
    type.trim().toLowerCase()
  );
}

export interface ValidateClassificationOptions {
  allowFallbackToGeneral?: boolean;
  expectedDocumentId?: string;
}

/**
 * Normalizes whitespace (collapsing multiple spaces, tabs, and newlines into single spaces)
 * to allow robust matching against OCR or PDF layout variations while preserving textual integrity.
 */
export function normalizeWhitespace(text: string): string {
  if (!text) return "";
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Checks if candidate text exists within section content, testing exact match first,
 * then falling back to normalized whitespace matching.
 */
export function isExcerptInContent(content: string, excerpt: string): boolean {
  if (!content || !excerpt) return false;
  const cleanExcerpt = excerpt.trim();
  if (!cleanExcerpt) return false;

  // 1. Direct exact substring match
  if (content.includes(cleanExcerpt)) {
    return true;
  }

  // 2. Normalized whitespace match
  const normContent = normalizeWhitespace(content);
  const normExcerpt = normalizeWhitespace(cleanExcerpt);

  return normContent.includes(normExcerpt);
}

/**
 * Result returned by the unified section excerpt evidence verification primitive (Slice 3.5).
 */
export interface SectionExcerptEvidenceResult {
  isValid: boolean;
  targetSection: IntelligenceInputSection | null;
  chunkId: string | null;
  pageNumber: number | null;
  cleanSourceText: string;
  failureReason?: string;
}

/**
 * Locates the specific chunk within a section that contains the given sourceText excerpt.
 * Returns the matching chunkId and pageNumber if found.
 */
export function findMatchingChunk(
  chunks: IntelligenceInputChunk[],
  sourceText: string,
  sectionFallbackPage: number | null
): { chunkId: string | null; pageNumber: number | null } {
  if (!chunks || chunks.length === 0 || !sourceText) {
    return { chunkId: null, pageNumber: sectionFallbackPage };
  }

  for (const chunk of chunks) {
    if (isExcerptInContent(chunk.content, sourceText)) {
      return {
        chunkId: chunk.id,
        pageNumber: chunk.pageNumber ?? sectionFallbackPage,
      };
    }
  }

  // Excerpt might span chunk boundary or chunks were segmented differently:
  // Return section fallback page
  return { chunkId: null, pageNumber: sectionFallbackPage };
}

/**
 * Deterministically verifies whether a candidate sourceText excerpt exists within
 * the referenced persisted section (Slice 3.5 core primitive).
 *
 * Invariants:
 * 1. The LLM is never the source of truth.
 * 2. sectionOrderIndex must be a non-negative integer present in sectionsByOrder.
 * 3. If expectedDocumentId is provided and targetSection.documentId is present, they must match
 *    (preventing cross-document reference contamination).
 * 4. sourceText must be non-empty string.
 * 5. Uses exact substring matching first, followed by whitespace-normalized matching.
 * 6. Never uses fuzzy semantic guessing, embeddings, or probabilistic similarity.
 * 7. Resolves authoritative chunkId and pageNumber if chunksBySectionId is provided.
 */
export function verifySectionExcerptEvidence(
  sectionOrderIndex: number | null | undefined,
  sourceText: string | null | undefined,
  sectionsByOrder: Map<number, IntelligenceInputSection>,
  chunksBySectionId?: Map<string, IntelligenceInputChunk[]>,
  options?: { expectedDocumentId?: string }
): SectionExcerptEvidenceResult {
  if (
    typeof sectionOrderIndex !== "number" ||
    sectionOrderIndex < 0 ||
    !Number.isInteger(sectionOrderIndex)
  ) {
    return {
      isValid: false,
      targetSection: null,
      chunkId: null,
      pageNumber: null,
      cleanSourceText: "",
      failureReason: `Invalid sectionOrderIndex: ${sectionOrderIndex}`,
    };
  }

  const targetSection = sectionsByOrder.get(sectionOrderIndex);
  if (!targetSection) {
    return {
      isValid: false,
      targetSection: null,
      chunkId: null,
      pageNumber: null,
      cleanSourceText: "",
      failureReason: `Referenced section index ${sectionOrderIndex} does not exist in persisted sections`,
    };
  }

  // Cross-document reference validation
  if (
    options?.expectedDocumentId &&
    targetSection.documentId &&
    targetSection.documentId !== options.expectedDocumentId
  ) {
    return {
      isValid: false,
      targetSection: null,
      chunkId: null,
      pageNumber: null,
      cleanSourceText: "",
      failureReason: `Section ${sectionOrderIndex} belongs to document ${targetSection.documentId}, not expected document ${options.expectedDocumentId}`,
    };
  }

  if (!sourceText || typeof sourceText !== "string") {
    return {
      isValid: false,
      targetSection,
      chunkId: null,
      pageNumber: targetSection.pageStart,
      cleanSourceText: "",
      failureReason: "sourceText is missing or not a string",
    };
  }

  const cleanSourceText = sourceText.trim();
  if (cleanSourceText.length === 0) {
    return {
      isValid: false,
      targetSection,
      chunkId: null,
      pageNumber: targetSection.pageStart,
      cleanSourceText: "",
      failureReason: "sourceText is empty after trimming",
    };
  }

  if (!isExcerptInContent(targetSection.content, cleanSourceText)) {
    return {
      isValid: false,
      targetSection,
      chunkId: null,
      pageNumber: targetSection.pageStart,
      cleanSourceText,
      failureReason: `sourceText was not found in referenced section ${sectionOrderIndex}`,
    };
  }

  // Authoritative chunk and page resolution
  const sectionChunks = chunksBySectionId?.get(targetSection.id) ?? [];
  const { chunkId, pageNumber } = findMatchingChunk(
    sectionChunks,
    cleanSourceText,
    targetSection.pageStart
  );

  return {
    isValid: true,
    targetSection,
    chunkId,
    pageNumber,
    cleanSourceText,
  };
}

/**
 * Deterministically validates an entire AI intelligence response against persisted document data.
 */
export function validateIntelligenceEvidence(
  raw: RawAiIntelligenceResponse,
  payload: IntelligenceInputPayload
): ValidatedIntelligenceResult {
  const sectionsByOrder = new Map<number, IntelligenceInputSection>();
  for (const sec of payload.sections) {
    sectionsByOrder.set(sec.orderIndex, sec);
  }

  const chunksBySectionId = new Map<string, IntelligenceInputChunk[]>();
  for (const chk of payload.chunks) {
    const list = chunksBySectionId.get(chk.sectionId) ?? [];
    list.push(chk);
    chunksBySectionId.set(chk.sectionId, list);
  }

  let rejectedFindingsCount = 0;

  // ---------------------------------------------------------------------------
  // 1. Validate Classification & Document Type Evidence
  // ---------------------------------------------------------------------------
  let validatedClassification: ValidatedClassification;
  const rawClass = raw.classification;

  if (rawClass.isStatedInText && rawClass.sourceText && typeof rawClass.sectionOrderIndex === "number") {
    const check = verifySectionExcerptEvidence(
      rawClass.sectionOrderIndex,
      rawClass.sourceText,
      sectionsByOrder,
      undefined,
      { expectedDocumentId: payload.documentId }
    );
    if (check.isValid && check.targetSection) {
      validatedClassification = {
        documentType: rawClass.documentType.trim(),
        isStatedInText: true,
        sourceText: check.cleanSourceText,
        sectionId: check.targetSection.id,
        sectionOrderIndex: check.targetSection.orderIndex,
        inferenceReason: rawClass.inferenceReason ?? null,
      };
    } else {
      // Stated text could not be verified in the referenced section: downgrade to inference
      validatedClassification = {
        documentType: rawClass.documentType.trim(),
        isStatedInText: false,
        sourceText: null,
        sectionId: null,
        sectionOrderIndex: null,
        inferenceReason:
          rawClass.inferenceReason?.trim() ||
          `Classified as ${rawClass.documentType} based on document structure and terminology.`,
      };
    }
  } else {
    validatedClassification = {
      documentType: rawClass.documentType.trim(),
      isStatedInText: false,
      sourceText: null,
      sectionId: null,
      sectionOrderIndex: null,
      inferenceReason:
        rawClass.inferenceReason?.trim() ||
        `Classified as ${rawClass.documentType} based on general document contents.`,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Validate Parties Evidence
  // ---------------------------------------------------------------------------
  const validatedParties: ValidatedParty[] = [];
  for (const party of raw.parties) {
    const validParty = validatePartyEvidence(party, sectionsByOrder, chunksBySectionId, {
      expectedDocumentId: payload.documentId,
    });
    if (validParty) {
      validatedParties.push(validParty);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Validate Governing Law Evidence
  // ---------------------------------------------------------------------------
  let validatedGoverningLaw: ValidatedGoverningLaw | null = null;
  if (raw.governingLaw) {
    validatedGoverningLaw = validateGoverningLawEvidence(
      raw.governingLaw,
      sectionsByOrder,
      chunksBySectionId,
      { expectedDocumentId: payload.documentId }
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Validate Jurisdiction Evidence
  // ---------------------------------------------------------------------------
  let validatedJurisdiction: ValidatedJurisdiction | null = null;
  if (raw.jurisdiction) {
    validatedJurisdiction = validateJurisdictionEvidence(
      raw.jurisdiction,
      sectionsByOrder,
      chunksBySectionId,
      { expectedDocumentId: payload.documentId }
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Validate Important Sections
  // ---------------------------------------------------------------------------
  const validatedImportantSections: ValidatedImportantSection[] = [];
  for (const impSec of raw.importantSections) {
    const validSec = validateImportantSectionEvidence(impSec, sectionsByOrder, {
      expectedDocumentId: payload.documentId,
    });
    if (validSec) {
      validatedImportantSections.push(validSec);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Validate Findings Evidence
  // ---------------------------------------------------------------------------
  const { validatedFindings, rejectedCount: findingsRejectedCount } =
    validateFindingsListEvidence(
      raw.findings,
      payload.sections,
      validatedClassification.documentType,
      payload.chunks,
      { documentId: payload.documentId }
    );
  rejectedFindingsCount += findingsRejectedCount;

  return {
    documentId: payload.documentId,
    classification: validatedClassification,
    parties: validatedParties,
    governingLaw: validatedGoverningLaw,
    jurisdiction: validatedJurisdiction,
    executiveSummary: raw.executiveSummary.trim(),
    importantSections: validatedImportantSections,
    findings: validatedFindings,
    rejectedFindingsCount,
  };
}

/**
 * Deterministically validates document classification and its supporting evidence
 * against persisted document sections (Slice 3.2).
 *
 * Requirements:
 * 1. Document category must belong to SUPPORTED_DOCUMENT_TYPES (or fall back to 'general' if allowed).
 * 2. Case A (Explicitly stated):
 *    - sourceText must be non-empty.
 *    - sectionOrderIndex must point to an existing section.
 *    - sourceText must be present in that section's content (exact or normalized whitespace).
 *    - Fabricated or absent source text is rejected (ClassificationEvidenceValidationError).
 * 3. Case B (Inferred):
 *    - sourceText, sectionId, sectionOrderIndex must be null.
 *    - inferenceReason must be provided.
 */
export function validateClassificationEvidence(
  raw: RawAiClassification,
  sections: IntelligenceInputSection[],
  options?: ValidateClassificationOptions
): ValidatedClassification {
  const sectionsByOrder = new Map<number, IntelligenceInputSection>();
  for (const sec of sections) {
    sectionsByOrder.set(sec.orderIndex, sec);
  }

  // 1. Resolve and validate document category
  const rawType = (raw.documentType || "").trim().toLowerCase();
  let resolvedType: SupportedDocumentType;

  if (isSupportedDocumentType(rawType)) {
    resolvedType = rawType;
  } else {
    const normalized = normalizeDocumentTypeKey(rawType);
    if (isSupportedDocumentType(normalized) && normalized !== "general") {
      resolvedType = normalized;
    } else if (options?.allowFallbackToGeneral) {
      resolvedType = "general";
    } else {
      throw new ClassificationEvidenceValidationError(
        `Unsupported document category: "${raw.documentType}". Supported categories are: ${SUPPORTED_DOCUMENT_TYPES.join(", ")}`
      );
    }
  }

  // 2. Validate grounding evidence
  if (raw.isStatedInText) {
    if (!raw.sourceText || raw.sourceText.trim().length === 0) {
      throw new ClassificationEvidenceValidationError(
        `Classification claims document type is stated in text, but sourceText is empty.`
      );
    }
    if (typeof raw.sectionOrderIndex !== "number" || raw.sectionOrderIndex < 0) {
      throw new ClassificationEvidenceValidationError(
        `Classification claims document type is stated in text, but sectionOrderIndex is missing or invalid.`
      );
    }

    const targetSection = sectionsByOrder.get(raw.sectionOrderIndex);
    if (!targetSection) {
      throw new ClassificationEvidenceValidationError(
        `Classification references nonexistent section index ${raw.sectionOrderIndex}.`
      );
    }

    if (
      options?.expectedDocumentId &&
      targetSection.documentId &&
      targetSection.documentId !== options.expectedDocumentId
    ) {
      throw new ClassificationEvidenceValidationError(
        `Classification section ${raw.sectionOrderIndex} belongs to document ${targetSection.documentId}, not expected document ${options.expectedDocumentId}.`
      );
    }

    if (!isExcerptInContent(targetSection.content, raw.sourceText)) {
      throw new ClassificationEvidenceValidationError(
        `Classification source text "${raw.sourceText.trim()}" was not found in referenced section ${raw.sectionOrderIndex}.`
      );
    }

    return {
      documentType: resolvedType,
      isStatedInText: true,
      sourceText: raw.sourceText.trim(),
      sectionId: targetSection.id,
      sectionOrderIndex: targetSection.orderIndex,
      inferenceReason: raw.inferenceReason?.trim() || null,
    };
  }

  // Case B: Inferred classification
  return {
    documentType: resolvedType,
    isStatedInText: false,
    sourceText: null,
    sectionId: null,
    sectionOrderIndex: null,
    inferenceReason:
      raw.inferenceReason?.trim() ||
      `Classified as ${resolvedType} based on document content and structure.`,
  };
}

// ---------------------------------------------------------------------------
// Slice 3.3 & 3.5 — Structured Extraction Evidence Validation
// ---------------------------------------------------------------------------

export interface ValidateStructuredExtractionOptions {
  strict?: boolean;
  documentId?: string;
  chunks?: IntelligenceInputChunk[];
}

/**
 * Validates a single party against document sections (Slice 3.3 / 3.5).
 * Returns ValidatedParty if valid, or null if invalid.
 */
export function validatePartyEvidence(
  party: RawAiParty,
  sectionsByOrder: Map<number, IntelligenceInputSection>,
  chunksBySectionId?: Map<string, IntelligenceInputChunk[]>,
  options?: { expectedDocumentId?: string }
): ValidatedParty | null {
  if (!party.name || party.name.trim().length === 0) return null;

  const check = verifySectionExcerptEvidence(
    party.sectionOrderIndex,
    party.sourceText,
    sectionsByOrder,
    chunksBySectionId,
    options
  );
  if (!check.isValid || !check.targetSection) return null;

  return {
    name: party.name.trim(),
    role: party.role?.trim() || null,
    sourceText: check.cleanSourceText,
    sectionId: check.targetSection.id,
    sectionOrderIndex: check.targetSection.orderIndex,
  };
}

/**
 * Validates a governing law provision against document sections (Slice 3.3 / 3.5).
 * Returns ValidatedGoverningLaw if valid, or null if invalid.
 */
export function validateGoverningLawEvidence(
  law: RawAiGoverningLaw,
  sectionsByOrder: Map<number, IntelligenceInputSection>,
  chunksBySectionId?: Map<string, IntelligenceInputChunk[]>,
  options?: { expectedDocumentId?: string }
): ValidatedGoverningLaw | null {
  if (!law.law || law.law.trim().length === 0) return null;

  const check = verifySectionExcerptEvidence(
    law.sectionOrderIndex,
    law.sourceText,
    sectionsByOrder,
    chunksBySectionId,
    options
  );
  if (!check.isValid || !check.targetSection) return null;

  return {
    law: law.law.trim(),
    sourceText: check.cleanSourceText,
    sectionId: check.targetSection.id,
    sectionOrderIndex: check.targetSection.orderIndex,
  };
}

/**
 * Validates a jurisdiction provision against document sections (Slice 3.3 / 3.5).
 * Returns ValidatedJurisdiction if valid, or null if invalid.
 */
export function validateJurisdictionEvidence(
  jurisdiction: RawAiJurisdiction,
  sectionsByOrder: Map<number, IntelligenceInputSection>,
  chunksBySectionId?: Map<string, IntelligenceInputChunk[]>,
  options?: { expectedDocumentId?: string }
): ValidatedJurisdiction | null {
  if (!jurisdiction.jurisdiction || jurisdiction.jurisdiction.trim().length === 0) return null;

  const check = verifySectionExcerptEvidence(
    jurisdiction.sectionOrderIndex,
    jurisdiction.sourceText,
    sectionsByOrder,
    chunksBySectionId,
    options
  );
  if (!check.isValid || !check.targetSection) return null;

  return {
    jurisdiction: jurisdiction.jurisdiction.trim(),
    sourceText: check.cleanSourceText,
    sectionId: check.targetSection.id,
    sectionOrderIndex: check.targetSection.orderIndex,
  };
}

/**
 * Validates an important date against document sections (Slice 3.3 / 3.5).
 * Returns ValidatedDate if valid, or null if invalid.
 */
export function validateDateEvidence(
  date: RawAiDate,
  sectionsByOrder: Map<number, IntelligenceInputSection>,
  chunksBySectionId?: Map<string, IntelligenceInputChunk[]>,
  options?: { expectedDocumentId?: string }
): ValidatedDate | null {
  if (!date.dateValue || date.dateValue.trim().length === 0) return null;

  const check = verifySectionExcerptEvidence(
    date.sectionOrderIndex,
    date.sourceText,
    sectionsByOrder,
    chunksBySectionId,
    options
  );
  if (!check.isValid || !check.targetSection) return null;

  return {
    dateValue: date.dateValue.trim(),
    dateType: date.dateType.trim(),
    description: date.description.trim(),
    sourceText: check.cleanSourceText,
    sectionId: check.targetSection.id,
    sectionOrderIndex: check.targetSection.orderIndex,
  };
}

/**
 * Validates a financial term against document sections (Slice 3.3 / 3.5).
 * Returns ValidatedFinancialTerm if valid, or null if invalid.
 */
export function validateFinancialTermEvidence(
  term: RawAiFinancialTerm,
  sectionsByOrder: Map<number, IntelligenceInputSection>,
  chunksBySectionId?: Map<string, IntelligenceInputChunk[]>,
  options?: { expectedDocumentId?: string }
): ValidatedFinancialTerm | null {
  if (!term.amount || term.amount.trim().length === 0) return null;

  const check = verifySectionExcerptEvidence(
    term.sectionOrderIndex,
    term.sourceText,
    sectionsByOrder,
    chunksBySectionId,
    options
  );
  if (!check.isValid || !check.targetSection) return null;

  return {
    amount: term.amount.trim(),
    currency: term.currency?.trim() || null,
    frequency: term.frequency?.trim() || null,
    description: term.description.trim(),
    sourceText: check.cleanSourceText,
    sectionId: check.targetSection.id,
    sectionOrderIndex: check.targetSection.orderIndex,
  };
}

/**
 * Validates an important section against document sections (Slice 3.3 / 3.5).
 * Returns ValidatedImportantSection if valid, or null if invalid.
 */
export function validateImportantSectionEvidence(
  sec: RawAiImportantSection,
  sectionsByOrder: Map<number, IntelligenceInputSection>,
  options?: { expectedDocumentId?: string }
): ValidatedImportantSection | null {
  if (
    typeof sec.sectionOrderIndex !== "number" ||
    sec.sectionOrderIndex < 0 ||
    !Number.isInteger(sec.sectionOrderIndex)
  ) {
    return null;
  }
  const targetSec = sectionsByOrder.get(sec.sectionOrderIndex);
  if (!targetSec) return null;

  if (
    options?.expectedDocumentId &&
    targetSec.documentId &&
    targetSec.documentId !== options.expectedDocumentId
  ) {
    return null;
  }

  return {
    sectionId: targetSec.id,
    sectionOrderIndex: targetSec.orderIndex,
    title: sec.title.trim(),
    reason: sec.reason.trim(),
  };
}

/**
 * Deterministically validates all structured extraction fields against persisted document sections (Slice 3.3).
 *
 * For each item:
 * 1. Referenced section must exist.
 * 2. Source text must occur in the referenced section (exact or whitespace-normalized).
 * 3. Invalid or fabricated items are filtered out (or rejected with an error if strict mode is requested).
 *
 * @param raw - Unverified AI structured extraction payload
 * @param sections - Persisted document sections
 * @param options - Validation options (e.g. strict)
 * @returns Grounded and validated structured extraction result
 */
export function validateStructuredExtractionEvidence(
  raw: RawAiStructuredExtraction,
  sections: IntelligenceInputSection[],
  options?: ValidateStructuredExtractionOptions
): ValidatedStructuredExtraction {
  const sectionsByOrder = new Map<number, IntelligenceInputSection>();
  for (const sec of sections) {
    sectionsByOrder.set(sec.orderIndex, sec);
  }

  const chunksBySectionId = new Map<string, IntelligenceInputChunk[]>();
  if (options?.chunks) {
    for (const chk of options.chunks) {
      const list = chunksBySectionId.get(chk.sectionId) ?? [];
      list.push(chk);
      chunksBySectionId.set(chk.sectionId, list);
    }
  }

  const checkOptions = options?.documentId
    ? { expectedDocumentId: options.documentId }
    : undefined;

  // 1. Validate Parties
  const validatedParties: ValidatedParty[] = [];
  for (const p of raw.parties) {
    const validated = validatePartyEvidence(p, sectionsByOrder, chunksBySectionId, checkOptions);
    if (validated) {
      validatedParties.push(validated);
    } else if (options?.strict) {
      throw new StructuredExtractionValidationError(
        `Party "${p.name}" failed evidence validation in section ${p.sectionOrderIndex}.`
      );
    }
  }

  // 2. Validate Governing Law
  let validatedGoverningLaw: ValidatedGoverningLaw | null = null;
  if (raw.governingLaw) {
    const validated = validateGoverningLawEvidence(raw.governingLaw, sectionsByOrder, chunksBySectionId, checkOptions);
    if (validated) {
      validatedGoverningLaw = validated;
    } else if (options?.strict) {
      throw new StructuredExtractionValidationError(
        `Governing law "${raw.governingLaw.law}" failed evidence validation in section ${raw.governingLaw.sectionOrderIndex}.`
      );
    }
  }

  // 3. Validate Jurisdiction
  let validatedJurisdiction: ValidatedJurisdiction | null = null;
  if (raw.jurisdiction) {
    const validated = validateJurisdictionEvidence(raw.jurisdiction, sectionsByOrder, chunksBySectionId, checkOptions);
    if (validated) {
      validatedJurisdiction = validated;
    } else if (options?.strict) {
      throw new StructuredExtractionValidationError(
        `Jurisdiction "${raw.jurisdiction.jurisdiction}" failed evidence validation in section ${raw.jurisdiction.sectionOrderIndex}.`
      );
    }
  }

  // 4. Validate Important Dates
  const validatedDates: ValidatedDate[] = [];
  for (const d of raw.importantDates) {
    const validated = validateDateEvidence(d, sectionsByOrder, chunksBySectionId, checkOptions);
    if (validated) {
      validatedDates.push(validated);
    } else if (options?.strict) {
      throw new StructuredExtractionValidationError(
        `Date "${d.dateValue}" (${d.dateType}) failed evidence validation in section ${d.sectionOrderIndex}.`
      );
    }
  }

  // 5. Validate Financial Terms
  const validatedFinancialTerms: ValidatedFinancialTerm[] = [];
  for (const f of raw.financialTerms) {
    const validated = validateFinancialTermEvidence(f, sectionsByOrder, chunksBySectionId, checkOptions);
    if (validated) {
      validatedFinancialTerms.push(validated);
    } else if (options?.strict) {
      throw new StructuredExtractionValidationError(
        `Financial term "${f.amount}" failed evidence validation in section ${f.sectionOrderIndex}.`
      );
    }
  }

  // 6. Validate Important Sections
  const validatedImportantSections: ValidatedImportantSection[] = [];
  for (const s of raw.importantSections) {
    const validated = validateImportantSectionEvidence(s, sectionsByOrder, checkOptions);
    if (validated) {
      validatedImportantSections.push(validated);
    } else if (options?.strict) {
      throw new StructuredExtractionValidationError(
        `Important section with index ${s.sectionOrderIndex} does not exist in persisted sections.`
      );
    }
  }

  return {
    parties: validatedParties,
    governingLaw: validatedGoverningLaw,
    jurisdiction: validatedJurisdiction,
    importantDates: validatedDates,
    financialTerms: validatedFinancialTerms,
    importantSections: validatedImportantSections,
  };
}

/**
 * Options for validating document findings evidence (Slice 3.4).
 */
export interface ValidateFindingsOptions {
  strict?: boolean;
}

/**
 * Validates a single AI finding candidate against persisted document sections and chunks (Slice 3.4).
 *
 * Invariants:
 * 1. Substantive findings ('key_term', 'attention', 'obligation', 'ambiguity', 'date', 'financial_term', 'inconsistency'):
 *    - Must reference a valid sectionIndex present in sectionsByOrder.
 *    - Must provide non-empty sourceText.
 *    - sourceText must exist in the referenced section (exact or whitespace-normalized).
 *    - Resolves authoritative sectionId from persisted section.
 *    - Correlates with specific chunkId and pageNumber if chunks are provided.
 * 2. Missing information findings ('missing_information'):
 *    - sourceText must be null or empty (absent content does not receive fabricated source text).
 *    - sectionOrderIndex must be null (do not attach an unrelated section to absent content).
 *    - expectedTopic must be grounded in the Core Provision Catalog for the documentType.
 *    - ruleBasis must be provided.
 *
 * Returns ValidatedFinding if valid, or null if candidate fails evidence checks.
 */
export function validateFindingEvidence(
  finding: RawAiFinding,
  sectionsByOrder: Map<number, IntelligenceInputSection>,
  documentType: string = "general",
  chunksBySectionId?: Map<string, IntelligenceInputChunk[]>,
  documentId: string = ""
): ValidatedFinding | null {
  if (finding.findingType === "missing_information") {
    // Invariant: absent content must not have fabricated source text
    if (finding.sourceText && finding.sourceText.trim().length > 0) {
      return null;
    }
    // Invariant: do not attach an unrelated section to absent content
    if (finding.sectionOrderIndex !== null && finding.sectionOrderIndex !== undefined) {
      return null;
    }

    // Validate expectedTopic against expectation catalog for this document type
    const topic = finding.expectedTopic;
    if (!isExpectedTopicAllowed(documentType, topic)) {
      return null;
    }

    return {
      documentId,
      sectionId: null,
      chunkId: null,
      findingType: "missing_information",
      importance: finding.importance,
      label: finding.label.trim(),
      summary: finding.summary.trim(),
      sourceText: null,
      pageNumber: null,
      metadata: {
        expectedTopic: finding.expectedTopic.trim(),
        ruleBasis: finding.ruleBasis.trim(),
        ...(finding.metadata ?? {}),
      },
    };
  }

  // Substantive finding validation via unified core primitive (Slice 3.5)
  const check = verifySectionExcerptEvidence(
    finding.sectionOrderIndex,
    finding.sourceText,
    sectionsByOrder,
    chunksBySectionId,
    documentId ? { expectedDocumentId: documentId } : undefined
  );

  if (!check.isValid || !check.targetSection) {
    return null;
  }

  return {
    documentId,
    sectionId: check.targetSection.id,
    chunkId: check.chunkId,
    findingType: finding.findingType,
    importance: finding.importance,
    label: finding.label.trim(),
    summary: finding.summary.trim(),
    sourceText: check.cleanSourceText,
    pageNumber: check.pageNumber,
    metadata: finding.metadata ?? null,
  };
}

/**
 * Deterministically validates a list of raw AI findings against persisted document sections and chunks (Slice 3.4).
 *
 * Invariants:
 * 1. The LLM is never the source of truth.
 * 2. Every substantive finding must have verifiable sourceText in the referenced section.
 * 3. missing_information findings must match the Core Provision Catalog.
 * 4. Fabricated, ungrounded, or mismatched citations are rejected before persistence.
 * 5. In strict mode, an ungrounded finding throws FindingEvidenceValidationError.
 *
 * @param rawFindings - Array of raw AI findings
 * @param sections - Persisted document sections
 * @param documentType - Resolved document classification type
 * @param chunks - Optional persisted document chunks for retrieval correlation
 * @param options - Validation options (strict mode, documentId)
 * @returns Object with validated findings array and count of rejected candidate findings
 */
export function validateFindingsListEvidence(
  rawFindings: RawAiFinding[],
  sections: IntelligenceInputSection[],
  documentType: string = "general",
  chunks?: IntelligenceInputChunk[],
  options?: ValidateFindingsOptions & { documentId?: string }
): { validatedFindings: ValidatedFinding[]; rejectedCount: number } {
  const sectionsByOrder = new Map<number, IntelligenceInputSection>();
  for (const sec of sections) {
    sectionsByOrder.set(sec.orderIndex, sec);
  }

  const chunksBySectionId = new Map<string, IntelligenceInputChunk[]>();
  if (chunks) {
    for (const chunk of chunks) {
      const existing = chunksBySectionId.get(chunk.sectionId) ?? [];
      existing.push(chunk);
      chunksBySectionId.set(chunk.sectionId, existing);
    }
  }

  const docId = options?.documentId ?? "";
  const validatedFindings: ValidatedFinding[] = [];
  let rejectedCount = 0;

  for (const rawFinding of rawFindings) {
    const validated = validateFindingEvidence(
      rawFinding,
      sectionsByOrder,
      documentType,
      chunksBySectionId,
      docId
    );

    if (validated) {
      validatedFindings.push(validated);
    } else {
      rejectedCount++;
      if (options?.strict) {
        if (rawFinding.findingType === "missing_information") {
          throw new FindingEvidenceValidationError(
            `Missing information finding "${rawFinding.label}" has invalid expected topic "${rawFinding.expectedTopic}" for document type "${documentType}", or provided disallowed sourceText/sectionOrderIndex.`
          );
        } else {
          throw new FindingEvidenceValidationError(
            `Substantive finding "${rawFinding.label}" (${rawFinding.findingType}) failed evidence verification: section index ${rawFinding.sectionOrderIndex} does not exist or sourceText was not found in section content.`
          );
        }
      }
    }
  }

  return { validatedFindings, rejectedCount };
}




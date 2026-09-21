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
  SUPPORTED_DOCUMENT_TYPES,
  type SupportedDocumentType,
} from "./schemas";
import {
  isExpectedTopicAllowed,
  normalizeDocumentTypeKey,
} from "./expectation-catalog";

export class ClassificationEvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClassificationEvidenceValidationError";
  }
}

export class StructuredExtractionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredExtractionValidationError";
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
 * Locates the specific chunk within a section that contains the given sourceText excerpt.
 * Returns the matching chunkId and pageNumber if found.
 */
function findMatchingChunk(
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
    const targetSection = sectionsByOrder.get(rawClass.sectionOrderIndex);
    if (targetSection && isExcerptInContent(targetSection.content, rawClass.sourceText)) {
      validatedClassification = {
        documentType: rawClass.documentType.trim(),
        isStatedInText: true,
        sourceText: rawClass.sourceText.trim(),
        sectionId: targetSection.id,
        sectionOrderIndex: targetSection.orderIndex,
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
    const sec = sectionsByOrder.get(party.sectionOrderIndex);
    if (!sec) {
      continue; // Dropped: invalid section index
    }
    if (!isExcerptInContent(sec.content, party.sourceText)) {
      continue; // Dropped: sourceText not found in section
    }

    validatedParties.push({
      name: party.name.trim(),
      role: party.role?.trim() || null,
      sourceText: party.sourceText.trim(),
      sectionId: sec.id,
      sectionOrderIndex: sec.orderIndex,
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Validate Governing Law Evidence
  // ---------------------------------------------------------------------------
  let validatedGoverningLaw: ValidatedGoverningLaw | null = null;
  if (raw.governingLaw) {
    const sec = sectionsByOrder.get(raw.governingLaw.sectionOrderIndex);
    if (sec && isExcerptInContent(sec.content, raw.governingLaw.sourceText)) {
      validatedGoverningLaw = {
        law: raw.governingLaw.law.trim(),
        sourceText: raw.governingLaw.sourceText.trim(),
        sectionId: sec.id,
        sectionOrderIndex: sec.orderIndex,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Validate Jurisdiction Evidence
  // ---------------------------------------------------------------------------
  let validatedJurisdiction: ValidatedJurisdiction | null = null;
  if (raw.jurisdiction) {
    const sec = sectionsByOrder.get(raw.jurisdiction.sectionOrderIndex);
    if (sec && isExcerptInContent(sec.content, raw.jurisdiction.sourceText)) {
      validatedJurisdiction = {
        jurisdiction: raw.jurisdiction.jurisdiction.trim(),
        sourceText: raw.jurisdiction.sourceText.trim(),
        sectionId: sec.id,
        sectionOrderIndex: sec.orderIndex,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Validate Important Sections
  // ---------------------------------------------------------------------------
  const validatedImportantSections: ValidatedImportantSection[] = [];
  for (const impSec of raw.importantSections) {
    const sec = sectionsByOrder.get(impSec.sectionOrderIndex);
    if (!sec) {
      continue; // Dropped: nonexistent section index
    }
    validatedImportantSections.push({
      sectionId: sec.id,
      sectionOrderIndex: sec.orderIndex,
      title: sec.title || impSec.title.trim(),
      reason: impSec.reason.trim(),
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Validate Findings Evidence
  // ---------------------------------------------------------------------------
  const validatedFindings: ValidatedFinding[] = [];

  for (const finding of raw.findings) {
    if (finding.findingType === "missing_information") {
      // Validate expectedTopic against expectation catalog for this document type
      const topic = finding.expectedTopic;
      if (!isExpectedTopicAllowed(validatedClassification.documentType, topic)) {
        // Disallowed arbitrary missing provision -> reject candidate
        rejectedFindingsCount++;
        continue;
      }

      validatedFindings.push({
        documentId: payload.documentId,
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
      });
      continue;
    }

    // Substantive finding validation
    const sectionIndex = finding.sectionOrderIndex;
    const targetSection = sectionsByOrder.get(sectionIndex);

    if (!targetSection) {
      // Discard: points to nonexistent section
      rejectedFindingsCount++;
      continue;
    }

    if (!isExcerptInContent(targetSection.content, finding.sourceText)) {
      // Discard: sourceText does not exist in referenced section
      rejectedFindingsCount++;
      continue;
    }

    // Match to specific chunk if possible
    const sectionChunks = chunksBySectionId.get(targetSection.id) ?? [];
    const { chunkId, pageNumber } = findMatchingChunk(
      sectionChunks,
      finding.sourceText,
      targetSection.pageStart
    );

    validatedFindings.push({
      documentId: payload.documentId,
      sectionId: targetSection.id,
      chunkId,
      findingType: finding.findingType,
      importance: finding.importance,
      label: finding.label.trim(),
      summary: finding.summary.trim(),
      sourceText: finding.sourceText.trim(),
      pageNumber,
      metadata: finding.metadata ?? null,
    });
  }

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
// Slice 3.3 — Structured Extraction Evidence Validation
// ---------------------------------------------------------------------------

export interface ValidateStructuredExtractionOptions {
  strict?: boolean;
}

/**
 * Validates a single party against document sections.
 * Returns ValidatedParty if valid, or null if invalid.
 */
export function validatePartyEvidence(
  party: RawAiParty,
  sectionsByOrder: Map<number, IntelligenceInputSection>
): ValidatedParty | null {
  const targetSec = sectionsByOrder.get(party.sectionOrderIndex);
  if (!targetSec) return null;
  if (!isExcerptInContent(targetSec.content, party.sourceText)) return null;

  return {
    name: party.name.trim(),
    role: party.role?.trim() || null,
    sourceText: party.sourceText.trim(),
    sectionId: targetSec.id,
    sectionOrderIndex: targetSec.orderIndex,
  };
}

/**
 * Validates a governing law provision against document sections.
 * Returns ValidatedGoverningLaw if valid, or null if invalid.
 */
export function validateGoverningLawEvidence(
  law: RawAiGoverningLaw,
  sectionsByOrder: Map<number, IntelligenceInputSection>
): ValidatedGoverningLaw | null {
  const targetSec = sectionsByOrder.get(law.sectionOrderIndex);
  if (!targetSec) return null;
  if (!isExcerptInContent(targetSec.content, law.sourceText)) return null;

  return {
    law: law.law.trim(),
    sourceText: law.sourceText.trim(),
    sectionId: targetSec.id,
    sectionOrderIndex: targetSec.orderIndex,
  };
}

/**
 * Validates a jurisdiction provision against document sections.
 * Returns ValidatedJurisdiction if valid, or null if invalid.
 */
export function validateJurisdictionEvidence(
  jurisdiction: RawAiJurisdiction,
  sectionsByOrder: Map<number, IntelligenceInputSection>
): ValidatedJurisdiction | null {
  const targetSec = sectionsByOrder.get(jurisdiction.sectionOrderIndex);
  if (!targetSec) return null;
  if (!isExcerptInContent(targetSec.content, jurisdiction.sourceText)) return null;

  return {
    jurisdiction: jurisdiction.jurisdiction.trim(),
    sourceText: jurisdiction.sourceText.trim(),
    sectionId: targetSec.id,
    sectionOrderIndex: targetSec.orderIndex,
  };
}

/**
 * Validates an important date against document sections.
 * Returns ValidatedDate if valid, or null if invalid.
 */
export function validateDateEvidence(
  date: RawAiDate,
  sectionsByOrder: Map<number, IntelligenceInputSection>
): ValidatedDate | null {
  const targetSec = sectionsByOrder.get(date.sectionOrderIndex);
  if (!targetSec) return null;
  if (!isExcerptInContent(targetSec.content, date.sourceText)) return null;

  return {
    dateValue: date.dateValue.trim(),
    dateType: date.dateType.trim(),
    description: date.description.trim(),
    sourceText: date.sourceText.trim(),
    sectionId: targetSec.id,
    sectionOrderIndex: targetSec.orderIndex,
  };
}

/**
 * Validates a financial term against document sections.
 * Returns ValidatedFinancialTerm if valid, or null if invalid.
 */
export function validateFinancialTermEvidence(
  term: RawAiFinancialTerm,
  sectionsByOrder: Map<number, IntelligenceInputSection>
): ValidatedFinancialTerm | null {
  const targetSec = sectionsByOrder.get(term.sectionOrderIndex);
  if (!targetSec) return null;
  if (!isExcerptInContent(targetSec.content, term.sourceText)) return null;

  return {
    amount: term.amount.trim(),
    currency: term.currency?.trim() || null,
    frequency: term.frequency?.trim() || null,
    description: term.description.trim(),
    sourceText: term.sourceText.trim(),
    sectionId: targetSec.id,
    sectionOrderIndex: targetSec.orderIndex,
  };
}

/**
 * Validates an important section against document sections.
 * Returns ValidatedImportantSection if valid, or null if invalid.
 */
export function validateImportantSectionEvidence(
  sec: RawAiImportantSection,
  sectionsByOrder: Map<number, IntelligenceInputSection>
): ValidatedImportantSection | null {
  const targetSec = sectionsByOrder.get(sec.sectionOrderIndex);
  if (!targetSec) return null;

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

  // 1. Validate Parties
  const validatedParties: ValidatedParty[] = [];
  for (const p of raw.parties) {
    const validated = validatePartyEvidence(p, sectionsByOrder);
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
    const validated = validateGoverningLawEvidence(raw.governingLaw, sectionsByOrder);
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
    const validated = validateJurisdictionEvidence(raw.jurisdiction, sectionsByOrder);
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
    const validated = validateDateEvidence(d, sectionsByOrder);
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
    const validated = validateFinancialTermEvidence(f, sectionsByOrder);
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
    const validated = validateImportantSectionEvidence(s, sectionsByOrder);
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




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
} from "./types";
import type { RawAiIntelligenceResponse } from "./schemas";
import { isExpectedTopicAllowed } from "./expectation-catalog";

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


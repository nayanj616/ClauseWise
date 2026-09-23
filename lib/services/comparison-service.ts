/**
 * Document Comparison Domain Service — ClauseWise (Phase 9)
 *
 * Implements deterministic side-by-side comparison between two verified documents.
 * Core Principle: EVIDENCE → MEANING → ACTION
 *
 * Invariants & Safety Guarantees:
 * 1. Strict Tenant Isolation:
 *    - Both Document A and Document B must belong to the authenticated user.
 * 2. Anti-Oracle Protection:
 *    - Non-existent, unauthorized, or cross-tenant document queries throw uniform
 *      ComparisonAccessError (mapped to 404 Not Found).
 * 3. Self-Comparison Guard:
 *    - Comparing a document with itself (docA === docB) throws ComparisonValidationError (mapped to 400).
 * 4. Readiness Enforcement:
 *    - Both documents must be in 'ready' status (mapped to 422 if still extracting/processing/error).
 * 5. Deterministic Hybrid Multi-Tier Alignment (Strategy D):
 *    - Tier 1: Metadata diffing (parties, governing law, jurisdiction, document type).
 *    - Tier 2: Exact normalized title matching.
 *    - Tier 3: Canonical provision catalog keyword matching.
 *    - Tier 4: Controlled Jaccard content overlap fallback (strictly 1:1 with deterministic tie-breaking).
 * 6. Strict "Unchanged" Contract:
 *    - Sections are classified as "unchanged" ONLY when normalized text is strictly identical.
 *    - Any wording discrepancy classifies the section as "modified" to avoid hiding substantive changes.
 * 7. Factual & Neutral Language Contract:
 *    - Describes what differs without value judgments, risk scoring, or legal recommendations.
 * 8. Traceability:
 *    - Every difference retains Document A and/or Document B section identifiers, page ranges,
 *      and verbatim text excerpts.
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  documents,
  type Document,
  type DocumentFinding,
} from "@/lib/db/schema";
import {
  getDocumentWorkspaceData,
  type WorkspaceSection,
} from "@/lib/services/document-service";
import { getPersistedDocumentFindings } from "@/lib/services/intelligence-service";
import type {
  DifferenceType,
  MetadataDifference,
  SectionDifferenceItem,
  DocumentComparisonSummary,
  DocumentComparisonResult,
} from "@/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Error Hierarchy
// ---------------------------------------------------------------------------

export class ComparisonError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ComparisonError";
  }
}

export class ComparisonValidationError extends ComparisonError {
  constructor(message: string) {
    super(message);
    this.name = "ComparisonValidationError";
  }
}

export class ComparisonAccessError extends ComparisonError {
  constructor(message = "Document not found or access denied") {
    super(message);
    this.name = "ComparisonAccessError";
  }
}

export class ComparisonReadinessError extends ComparisonError {
  readonly documentId: string;
  readonly status: string;
  constructor(documentId: string, status: string) {
    super(`Document ${documentId} is not ready for comparison (current status: ${status})`);
    this.name = "ComparisonReadinessError";
    this.documentId = documentId;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Text Normalization & Tokenization Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes section titles for comparison:
 * Lowercases, strips prefix clause markers (e.g., "Section 1.", "Article IV:", "1.0"),
 * removes punctuation, and collapses whitespace.
 */
export function normalizeTitle(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/^(section|article|clause|schedule|appendix|exhibit)\s*([0-9]+|[ivxlcdm]+)?\s*[:.\-–—]?\s*/i, "")
    .replace(/^(\d+(\.\d+)*|[ivxlcdm]+|[a-z])\s*[:.\-–—\)]\s*/i, "")
    .replace(/^(\d+(\.\d+)*)\s+/i, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes verbatim content for strict identity check:
 * Normalizes unicode whitespace, collapses multi-spaces, trims lines.
 */
export function normalizeContent(content: string): string {
  if (!content) return "";
  return content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

/**
 * Tokenizes text into a set of lowercased alphanumeric words for Jaccard similarity.
 */
function tokenizeWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2); // Ignore single/double character tokens
  return new Set(words);
}

/**
 * Computes Jaccard word-token similarity between two text strings.
 * Range: [0.0, 1.0]
 */
export function calculateJaccardSimilarity(textA: string, textB: string): number {
  const setA = tokenizeWords(textA);
  const setB = tokenizeWords(textB);

  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersectionSize = 0;
  for (const word of setA) {
    if (setB.has(word)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize > 0 ? intersectionSize / unionSize : 0.0;
}

// ---------------------------------------------------------------------------
// Canonical Legal Topic Taxonomy for Hybrid Matching
// ---------------------------------------------------------------------------

const CANONICAL_TOPIC_KEYWORDS: Record<string, string[]> = {
  confidentiality: ["confidential", "non-disclosure", "nda", "proprietary information", "secrecy"],
  termination: ["termination", "term and termination", "expiration", "survival", "cancel"],
  governing_law: ["governing law", "applicable law", "choice of law"],
  dispute_resolution: ["dispute resolution", "arbitration", "jurisdiction", "venue", "mediation"],
  indemnification: ["indemnif", "hold harmless", "defense"],
  limitation_of_liability: ["limitation of liability", "consequential damages", "liability cap"],
  payment_terms: ["fees", "payment", "invoic", "billing", "compensation", "rates", "pricing"],
  intellectual_property: ["intellectual property", "ownership", "work product", "patent", "copyright"],
  severance: ["severance", "separation pay", "departure"],
  non_compete: ["non-compete", "covenant not to compete", "restrictive covenant"],
  non_solicitation: ["non-solicit", "solicitation of employees", "solicitation of customers"],
  warranty: ["warranty", "warranties", "disclaimer of warranties", "as is"],
  force_majeure: ["force majeure", "act of god", "unforeseen events"],
  entire_agreement: ["entire agreement", "integration", "merger clause", "amendments"],
  assignment: ["assignment", "successors and assigns", "delegation"],
  notices: ["notices", "notice requirement", "formal notice"],
};

function getCanonicalTopic(title: string): string | null {
  const norm = normalizeTitle(title);
  for (const [topic, keywords] of Object.entries(CANONICAL_TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (norm.includes(kw)) {
        return topic;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Section Alignment Engine (Tier 2, 3, 4)
// ---------------------------------------------------------------------------

interface AlignedSectionPair {
  secA?: WorkspaceSection;
  secB?: WorkspaceSection;
  matchTier: "exact_title" | "canonical_topic" | "jaccard_content" | "unmatched";
}

/**
 * Aligns sections between Document A and Document B deterministically.
 * Enforces:
 * - Strictly 1-to-1 matching (no section can be paired multiple times).
 * - Multi-tier precedence:
 *   1. Exact normalized title match.
 *   2. Canonical legal topic match.
 *   3. Controlled Jaccard content overlap (threshold >= 0.45 with deterministic tie-breaking).
 * - Deterministic tie-breaking:
 *   1. Highest similarity score.
 *   2. Closest orderIndex distance.
 *   3. Lexicographic order of section IDs.
 */
export function alignDocumentSections(
  sectionsA: WorkspaceSection[],
  sectionsB: WorkspaceSection[]
): AlignedSectionPair[] {
  const matchedAIds = new Set<string>();
  const matchedBIds = new Set<string>();
  const pairs: AlignedSectionPair[] = [];

  // Pass 1: Exact normalized title match
  for (const sa of sectionsA) {
    if (matchedAIds.has(sa.id)) continue;
    const normA = normalizeTitle(sa.title);
    if (!normA) continue;

    for (const sb of sectionsB) {
      if (matchedBIds.has(sb.id)) continue;
      const normB = normalizeTitle(sb.title);

      if (normA === normB) {
        matchedAIds.add(sa.id);
        matchedBIds.add(sb.id);
        pairs.push({ secA: sa, secB: sb, matchTier: "exact_title" });
        break;
      }
    }
  }

  // Pass 2: Canonical legal topic match (from Core Provision Catalog)
  for (const sa of sectionsA) {
    if (matchedAIds.has(sa.id)) continue;
    const topicA = getCanonicalTopic(sa.title);
    if (!topicA) continue;

    for (const sb of sectionsB) {
      if (matchedBIds.has(sb.id)) continue;
      const topicB = getCanonicalTopic(sb.title);

      if (topicA === topicB) {
        matchedAIds.add(sa.id);
        matchedBIds.add(sb.id);
        pairs.push({ secA: sa, secB: sb, matchTier: "canonical_topic" });
        break;
      }
    }
  }

  // Pass 3: Controlled Jaccard content overlap fallback (Checkpoint 1)
  const JACCARD_THRESHOLD = 0.45;
  const remainingA = sectionsA.filter((s) => !matchedAIds.has(s.id));
  const remainingB = sectionsB.filter((s) => !matchedBIds.has(s.id));

  interface CandidateMatch {
    secA: WorkspaceSection;
    secB: WorkspaceSection;
    similarity: number;
    orderDiff: number;
  }

  const candidates: CandidateMatch[] = [];

  for (const sa of remainingA) {
    for (const sb of remainingB) {
      const sim = calculateJaccardSimilarity(sa.content, sb.content);
      if (sim >= JACCARD_THRESHOLD) {
        candidates.push({
          secA: sa,
          secB: sb,
          similarity: sim,
          orderDiff: Math.abs(sa.orderIndex - sb.orderIndex),
        });
      }
    }
  }

  // Deterministic tie-breaking:
  // 1. Highest similarity DESC
  // 2. Closest orderIndex difference ASC
  // 3. Stable section ID comparison
  candidates.sort((c1, c2) => {
    if (Math.abs(c1.similarity - c2.similarity) > 0.0001) {
      return c2.similarity - c1.similarity;
    }
    if (c1.orderDiff !== c2.orderDiff) {
      return c1.orderDiff - c2.orderDiff;
    }
    const cmpA = c1.secA.id.localeCompare(c2.secA.id);
    if (cmpA !== 0) return cmpA;
    return c1.secB.id.localeCompare(c2.secB.id);
  });

  for (const cand of candidates) {
    if (matchedAIds.has(cand.secA.id) || matchedBIds.has(cand.secB.id)) {
      continue;
    }
    matchedAIds.add(cand.secA.id);
    matchedBIds.add(cand.secB.id);
    pairs.push({
      secA: cand.secA,
      secB: cand.secB,
      matchTier: "jaccard_content",
    });
  }

  // Pass 4: Remaining unmatched in Document A (Removed / A only)
  for (const sa of sectionsA) {
    if (!matchedAIds.has(sa.id)) {
      matchedAIds.add(sa.id);
      pairs.push({ secA: sa, matchTier: "unmatched" });
    }
  }

  // Pass 5: Remaining unmatched in Document B (Added / B only)
  for (const sb of sectionsB) {
    if (!matchedBIds.has(sb.id)) {
      matchedBIds.add(sb.id);
      pairs.push({ secB: sb, matchTier: "unmatched" });
    }
  }

  // Sort pairs deterministically:
  // By orderIndex of Sec A (if present), then orderIndex of Sec B
  pairs.sort((p1, p2) => {
    const idxA1 = p1.secA?.orderIndex ?? Number.MAX_SAFE_INTEGER;
    const idxA2 = p2.secA?.orderIndex ?? Number.MAX_SAFE_INTEGER;
    if (idxA1 !== idxA2) return idxA1 - idxA2;

    const idxB1 = p1.secB?.orderIndex ?? Number.MAX_SAFE_INTEGER;
    const idxB2 = p2.secB?.orderIndex ?? Number.MAX_SAFE_INTEGER;
    return idxB1 - idxB2;
  });

  return pairs;
}

// ---------------------------------------------------------------------------
// Metadata Comparison Engine (Tier 1)
// ---------------------------------------------------------------------------

function formatPartiesString(
  parties: Array<{ name: string; role?: string | null }> | null | undefined
): string | null {
  if (!parties || parties.length === 0) return null;
  return parties
    .map((p) => {
      const name = typeof p === "string" ? p : p.name;
      const role = typeof p === "object" && p !== null ? p.role : undefined;
      return role ? `${name} (${role})` : name;
    })
    .join(", ");
}

export function compareDocumentMetadata(
  docA: {
    documentType: string | null;
    governingLaw: string | null;
    jurisdiction: string | null;
    parties: Array<{ name: string; role: string | null }> | null;
  },
  docB: {
    documentType: string | null;
    governingLaw: string | null;
    jurisdiction: string | null;
    parties: Array<{ name: string; role: string | null }> | null;
  }
): MetadataDifference[] {
  const partiesA = formatPartiesString(docA.parties);
  const partiesB = formatPartiesString(docB.parties);

  const fields: Array<{
    field: "document_type" | "governing_law" | "jurisdiction" | "parties";
    label: string;
    valA: string | null;
    valB: string | null;
  }> = [
    {
      field: "document_type",
      label: "Document Classification",
      valA: docA.documentType ?? null,
      valB: docB.documentType ?? null,
    },
    {
      field: "governing_law",
      label: "Governing Law",
      valA: docA.governingLaw ?? null,
      valB: docB.governingLaw ?? null,
    },
    {
      field: "jurisdiction",
      label: "Dispute Jurisdiction",
      valA: docA.jurisdiction ?? null,
      valB: docB.jurisdiction ?? null,
    },
    {
      field: "parties",
      label: "Identified Parties",
      valA: partiesA,
      valB: partiesB,
    },
  ];

  return fields.map(({ field, label, valA, valB }) => {
    const isDifferent =
      (valA?.toLowerCase().trim() ?? null) !== (valB?.toLowerCase().trim() ?? null);
    return {
      field,
      label,
      valueA: valA,
      valueB: valB,
      isDifferent,
    };
  });
}

// ---------------------------------------------------------------------------
// Difference Classifier & Narrative Generator
// ---------------------------------------------------------------------------

function classifyPairDifference(
  pair: AlignedSectionPair,
  findingsABySection: Map<string, DocumentFinding[]>,
  findingsBBySection: Map<string, DocumentFinding[]>
): SectionDifferenceItem {
  const { secA, secB } = pair;

  // Case 1: Added provision (Present in Document B only)
  if (!secA && secB) {
    const findingsB = findingsBBySection.get(secB.id) || [];
    const leadFinding = findingsB[0];
    const secNum = secB.sectionNumber ?? secB.orderIndex + 1;

    return {
      id: `diff-add-${secB.id}`,
      differenceType: "added",
      title: `${secB.title || `Section ${secNum}`} (Added in Document B)`,
      description: `Provision present in Document B (Section ${secNum}, page ${secB.pageStart || 1}); no corresponding section exists in Document A.`,
      sectionAId: null,
      sectionANumber: null,
      sectionATitle: null,
      sectionAPageStart: null,
      sectionAPageEnd: null,
      excerptA: null,
      findingAId: null,
      sectionBId: secB.id,
      sectionBNumber: secNum,
      sectionBTitle: secB.title,
      sectionBPageStart: secB.pageStart,
      sectionBPageEnd: secB.pageEnd,
      excerptB: secB.content.slice(0, 320),
      findingBId: leadFinding?.id ?? null,
      changeSummary: "New clause introduced in Document B.",
    };
  }

  // Case 2: Removed provision (Present in Document A only)
  if (secA && !secB) {
    const findingsA = findingsABySection.get(secA.id) || [];
    const leadFinding = findingsA[0];
    const secNum = secA.sectionNumber ?? secA.orderIndex + 1;

    return {
      id: `diff-rem-${secA.id}`,
      differenceType: "removed",
      title: `${secA.title || `Section ${secNum}`} (Removed in Document B)`,
      description: `Provision present in Document A (Section ${secNum}, page ${secA.pageStart || 1}); omitted or deleted from Document B.`,
      sectionAId: secA.id,
      sectionANumber: secNum,
      sectionATitle: secA.title,
      sectionAPageStart: secA.pageStart,
      sectionAPageEnd: secA.pageEnd,
      excerptA: secA.content.slice(0, 320),
      findingAId: leadFinding?.id ?? null,
      sectionBId: null,
      sectionBNumber: null,
      sectionBTitle: null,
      sectionBPageStart: null,
      sectionBPageEnd: null,
      excerptB: null,
      findingBId: null,
      changeSummary: "Clause omitted from Document B.",
    };
  }

  // Case 3: Both exist — Compare normalized text strictly (Checkpoint 3)
  if (secA && secB) {
    const normA = normalizeContent(secA.content);
    const normB = normalizeContent(secB.content);
    const secNumA = secA.sectionNumber ?? secA.orderIndex + 1;
    const secNumB = secB.sectionNumber ?? secB.orderIndex + 1;
    const findingsA = findingsABySection.get(secA.id) || [];
    const findingsB = findingsBBySection.get(secB.id) || [];
    const leadFindingA = findingsA[0];
    const leadFindingB = findingsB[0];

    // Strict identity check: exact match of normalized content
    if (normA === normB) {
      return {
        id: `diff-unc-${secA.id}-${secB.id}`,
        differenceType: "unchanged",
        title: secA.title || secB.title || `Section ${secNumA}`,
        description: `Content is textually identical across both documents (Section ${secNumA} in A, Section ${secNumB} in B).`,
        sectionAId: secA.id,
        sectionANumber: secNumA,
        sectionATitle: secA.title,
        sectionAPageStart: secA.pageStart,
        sectionAPageEnd: secA.pageEnd,
        excerptA: secA.content.slice(0, 320),
        findingAId: leadFindingA?.id ?? null,
        sectionBId: secB.id,
        sectionBNumber: secNumB,
        sectionBTitle: secB.title,
        sectionBPageStart: secB.pageStart,
        sectionBPageEnd: secB.pageEnd,
        excerptB: secB.content.slice(0, 320),
        findingBId: leadFindingB?.id ?? null,
        changeSummary: "Identical wording in both documents.",
      };
    }

    // Any text alteration classifies as "modified"
    const wordsA = secA.content.trim().split(/\s+/).length;
    const wordsB = secB.content.trim().split(/\s+/).length;
    const wordDiffDesc =
      wordsA === wordsB
        ? `Wording altered (${wordsA} words each)`
        : `Wording altered (Doc A: ${wordsA} words, Doc B: ${wordsB} words)`;

    const titleA = secA.title || `Section ${secNumA}`;
    const titleB = secB.title || `Section ${secNumB}`;
    const displayTitle =
      normalizeTitle(titleA) === normalizeTitle(titleB)
        ? titleA
        : `${titleA} / ${titleB}`;

    return {
      id: `diff-mod-${secA.id}-${secB.id}`,
      differenceType: "modified",
      title: `${displayTitle} (Modified)`,
      description: `Wording differs between Document A (Section ${secNumA}, page ${secA.pageStart || 1}) and Document B (Section ${secNumB}, page ${secB.pageStart || 1}).`,
      sectionAId: secA.id,
      sectionANumber: secNumA,
      sectionATitle: secA.title,
      sectionAPageStart: secA.pageStart,
      sectionAPageEnd: secA.pageEnd,
      excerptA: secA.content.slice(0, 320),
      findingAId: leadFindingA?.id ?? null,
      sectionBId: secB.id,
      sectionBNumber: secNumB,
      sectionBTitle: secB.title,
      sectionBPageStart: secB.pageStart,
      sectionBPageEnd: secB.pageEnd,
      excerptB: secB.content.slice(0, 320),
      findingBId: leadFindingB?.id ?? null,
      changeSummary: wordDiffDesc,
    };
  }

  // Fallback edge case (neither section present, should never happen)
  throw new ComparisonError("Invalid alignment pair with no sections");
}

// ---------------------------------------------------------------------------
// Main Service Boundary: compareDocuments
// ---------------------------------------------------------------------------

export interface CompareDocumentsInput {
  documentAId: string;
  documentBId: string;
  userId: string;
}

/**
 * Compares two documents owned by the authenticated user and returns structured,
 * evidence-backed differences.
 *
 * @param input.documentAId - Base document UUID
 * @param input.documentBId - Comparison document UUID
 * @param input.userId - Authenticated user UUID
 * @returns Complete DocumentComparisonResult
 */
export async function compareDocuments(
  input: CompareDocumentsInput
): Promise<DocumentComparisonResult> {
  const { documentAId, documentBId, userId } = input;

  // 1. Parameter presence and format validation
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new ComparisonValidationError("Authenticated user ID is required");
  }

  if (
    !documentAId ||
    typeof documentAId !== "string" ||
    !UUID_REGEX.test(documentAId.trim())
  ) {
    throw new ComparisonValidationError("Invalid Document A ID format");
  }

  if (
    !documentBId ||
    typeof documentBId !== "string" ||
    !UUID_REGEX.test(documentBId.trim())
  ) {
    throw new ComparisonValidationError("Invalid Document B ID format");
  }

  const cleanDocAId = documentAId.trim();
  const cleanDocBId = documentBId.trim();
  const cleanUserId = userId.trim();

  // 2. Self-comparison rejection guard
  if (cleanDocAId.toLowerCase() === cleanDocBId.toLowerCase()) {
    throw new ComparisonValidationError(
      "Cannot compare a document with itself. Please select two distinct documents."
    );
  }

  // 3. Load workspace data for both documents (enforces tenant isolation)
  const [dataA, dataB] = await Promise.all([
    getDocumentWorkspaceData(cleanDocAId, cleanUserId),
    getDocumentWorkspaceData(cleanDocBId, cleanUserId),
  ]);

  // Anti-oracle protection: If either document does not exist or belongs to another user,
  // return uniform 404 access error without leaking document existence.
  if (!dataA) {
    throw new ComparisonAccessError("Document A not found or access denied");
  }
  if (!dataB) {
    throw new ComparisonAccessError("Document B not found or access denied");
  }

  // 4. Verify processing readiness for both documents
  if (dataA.document.status !== "ready") {
    throw new ComparisonReadinessError(cleanDocAId, dataA.document.status);
  }
  if (dataB.document.status !== "ready") {
    throw new ComparisonReadinessError(cleanDocBId, dataB.document.status);
  }

  // 5. Load persisted findings for both documents
  const [findingsA, findingsB] = await Promise.all([
    getPersistedDocumentFindings(cleanDocAId),
    getPersistedDocumentFindings(cleanDocBId),
  ]);

  // Index findings by sectionId for quick evidence attachment
  const findingsABySection = new Map<string, DocumentFinding[]>();
  for (const f of findingsA) {
    if (f.sectionId) {
      const list = findingsABySection.get(f.sectionId) || [];
      list.push(f);
      findingsABySection.set(f.sectionId, list);
    }
  }

  const findingsBBySection = new Map<string, DocumentFinding[]>();
  for (const f of findingsB) {
    if (f.sectionId) {
      const list = findingsBBySection.get(f.sectionId) || [];
      list.push(f);
      findingsBBySection.set(f.sectionId, list);
    }
  }

  // 6. Tier 1: Compare high-level metadata
  const metadataDifferences = compareDocumentMetadata(
    {
      documentType: dataA.document.documentType ?? null,
      governingLaw: dataA.document.governingLaw ?? null,
      jurisdiction: dataA.document.jurisdiction ?? null,
      parties: dataA.document.parties ?? null,
    },
    {
      documentType: dataB.document.documentType ?? null,
      governingLaw: dataB.document.governingLaw ?? null,
      jurisdiction: dataB.document.jurisdiction ?? null,
      parties: dataB.document.parties ?? null,
    }
  );

  // 7. Tier 2, 3, 4: Align sections deterministically
  const alignedPairs = alignDocumentSections(dataA.sections, dataB.sections);

  // 8. Classify differences for each aligned pair
  const differences: SectionDifferenceItem[] = alignedPairs.map((pair) =>
    classifyPairDifference(pair, findingsABySection, findingsBBySection)
  );

  // 9. Compute summary counters
  let addedCount = 0;
  let removedCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;

  for (const diff of differences) {
    if (diff.differenceType === "added") addedCount++;
    else if (diff.differenceType === "removed") removedCount++;
    else if (diff.differenceType === "modified") modifiedCount++;
    else if (diff.differenceType === "unchanged") unchangedCount++;
  }

  const summary: DocumentComparisonSummary = {
    totalDifferences: addedCount + removedCount + modifiedCount,
    addedCount,
    removedCount,
    modifiedCount,
    unchangedCount,
  };

  return {
    documentA: {
      id: dataA.document.id,
      title: dataA.document.filename,
      filename: dataA.document.filename,
      documentType: dataA.document.documentType ?? null,
      pageCount: dataA.document.pageCount ?? null,
      governingLaw: dataA.document.governingLaw ?? null,
      jurisdiction: dataA.document.jurisdiction ?? null,
      parties: dataA.document.parties ?? null,
    },
    documentB: {
      id: dataB.document.id,
      title: dataB.document.filename,
      filename: dataB.document.filename,
      documentType: dataB.document.documentType ?? null,
      pageCount: dataB.document.pageCount ?? null,
      governingLaw: dataB.document.governingLaw ?? null,
      jurisdiction: dataB.document.jurisdiction ?? null,
      parties: dataB.document.parties ?? null,
    },
    metadataDifferences,
    differences,
    summary,
    comparedAt: new Date(),
  };
}

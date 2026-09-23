/**
 * Professional Prep Domain Service — ClauseWise (Phase 8)
 *
 * Implements deterministic briefing assembly for legal consultation preparation.
 * Core Principle: EVIDENCE → MEANING → ACTION
 *
 * Invariants & Safety Guarantees:
 * 1. Strict Tenant Isolation on Every Operation:
 *    - All operations verify documents.userId === userId.
 * 2. Anti-Oracle Protection:
 *    - Non-existent or cross-tenant documents throw uniform PrepAccessError (mapped to 404).
 * 3. Deterministic Assembly without Speculative LLM Inference:
 *    - Uses validated, persisted document intelligence, findings, actions, and Q&A user questions.
 * 4. Discussion Prompts, NEVER Legal Advice or Recommendations:
 *    - Questions for counsel are framed strictly as objective inquiry topics to explore with an attorney,
 *      never asserting conclusions, risk scores, or contract revision directives.
 * 5. Full Source Traceability:
 *    - Every key clause, finding, action, and question for counsel retains verified section coordinates,
 *      page numbers, and verbatim excerpts (or catalog basis for absent terms).
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  documents,
  type DocumentFinding,
} from "@/lib/db/schema";
import {
  getDocumentWorkspaceData,
  type WorkspaceSection,
} from "@/lib/services/document-service";
import { getPersistedDocumentFindings } from "@/lib/services/intelligence-service";
import {
  listActionsByUser,
  type ActionWithDetails,
} from "@/lib/services/action-service";
import {
  getUserQuestionsForDocument,
  type UserRecordedQuestion,
} from "@/lib/services/conversation-service";
import type { ValidatedImportantSection } from "@/lib/intelligence/types";

// ---------------------------------------------------------------------------
// Domain Errors
// ---------------------------------------------------------------------------

export class PrepServiceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PrepServiceError";
  }
}

export class PrepAccessError extends PrepServiceError {
  constructor(message = "Document not found or access denied") {
    super(message);
    this.name = "PrepAccessError";
  }
}

export class PrepValidationError extends PrepServiceError {
  constructor(message: string) {
    super(message);
    this.name = "PrepValidationError";
  }
}

// ---------------------------------------------------------------------------
// Schemas & Types
// ---------------------------------------------------------------------------

const UUID_SCHEMA = z.string().uuid("Invalid UUID format");

export const PrepContextSchema = z.object({
  documentId: UUID_SCHEMA,
  userId: z.string().trim().min(1, "User ID is required"),
});

export interface KeyClauseItem {
  sectionId: string;
  orderIndex: number;
  sectionNumber?: number | null;
  title: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  importanceReason?: string;
  verbatimExcerpt?: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  category: "missing_provision" | "ambiguity" | "inconsistency" | "attention_item";
  findingId?: string;
  sectionId?: string | null;
  sectionTitle?: string | null;
  pageNumber?: number | null;
  sourceText?: string | null;
  catalogTopic?: string | null;
}

export interface ProfessionalPrepData {
  document: {
    id: string;
    filename: string;
    documentType: string | null;
    isStatedType: boolean;
    parties: Array<{ name: string; role: string | null }> | null;
    governingLaw: string | null;
    jurisdiction: string | null;
    pageCount: number | null;
    fileSizeBytes: number;
    createdAt: Date;
    executiveSummary?: string | null;
  };
  keyClauses: KeyClauseItem[];
  findingsSummary: {
    attentionItems: DocumentFinding[];
    ambiguitiesAndInconsistencies: DocumentFinding[];
    missingProvisions: DocumentFinding[];
    obligationsAndTerms: DocumentFinding[];
    totalFindingsCount: number;
  };
  openActions: ActionWithDetails[];
  completedActionsCount: number;
  userQuestions: UserRecordedQuestion[];
  clarificationQuestions: ClarificationQuestion[];
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// Ownership Verification Helper
// ---------------------------------------------------------------------------

/**
 * Verifies that the specified document exists and belongs to the authenticated user.
 * Throws uniform PrepAccessError on unauthorized or nonexistent requests (anti-oracle).
 */
export async function verifyDocumentOwnership(
  documentId: string,
  userId: string
): Promise<{ id: string }> {
  try {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
      .limit(1);

    if (!doc) {
      throw new PrepAccessError("Document not found or access denied");
    }

    return doc;
  } catch (error) {
    if (error instanceof PrepAccessError) throw error;
    throw new PrepServiceError("Failed to verify document ownership", {
      cause: error,
    });
  }
}

// ---------------------------------------------------------------------------
// Clarification Questions Derivation (Deterministic, Discussion-Framed)
// ---------------------------------------------------------------------------

/**
 * Derives grounded clarification prompts for discussion with counsel.
 *
 * Checkpoint invariant:
 * Questions are framed strictly as objective inquiry prompts ("Clarify...", "Discuss...", "Review..."),
 * NEVER as legal recommendations or directives ("This must be changed", "Clause is invalid").
 */
export function deriveClarificationQuestions(
  findings: DocumentFinding[],
  sectionsById: Map<string, WorkspaceSection>
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];
  const seenPrompts = new Set<string>();

  for (const finding of findings) {
    let questionText = "";
    let category: ClarificationQuestion["category"] = "attention_item";
    const section = finding.sectionId ? sectionsById.get(finding.sectionId) : undefined;
    const sectionTitle = section
      ? section.title || `Section ${section.orderIndex + 1}`
      : "the document";

    if (finding.findingType === "missing_information") {
      category = "missing_provision";
      const topic = (finding.metadata?.expectedTopic as string) || finding.label;
      questionText = `Discuss with counsel whether a standard provision regarding "${topic}" should be incorporated.`;
    } else if (finding.findingType === "ambiguity") {
      category = "ambiguity";
      questionText = `Clarify the intended scope and legal interpretation of "${finding.label}" in ${sectionTitle} with counsel.`;
    } else if (finding.findingType === "inconsistency") {
      category = "inconsistency";
      questionText = `Review with counsel how the terms regarding "${finding.label}" should be reconciled between affected provisions.`;
    } else if (finding.importance === "needs_attention") {
      category = "attention_item";
      questionText = `Review the obligations and potential implications of "${finding.label}" in ${sectionTitle} with counsel.`;
    }

    if (questionText && !seenPrompts.has(questionText)) {
      seenPrompts.add(questionText);
      questions.push({
        id: `cq-${finding.id}`,
        question: questionText,
        category,
        findingId: finding.id,
        sectionId: finding.sectionId,
        sectionTitle: section ? section.title : null,
        pageNumber: finding.pageNumber,
        sourceText: finding.sourceText,
        catalogTopic: (finding.metadata?.expectedTopic as string) || null,
      });
    }
  }

  return questions;
}

// ---------------------------------------------------------------------------
// Professional Prep Data Assembly Service
// ---------------------------------------------------------------------------

/**
 * Assembles the complete Professional Prep package for an authorized document.
 * Single source of truth for both server-side page rendering and the API route.
 */
export async function getProfessionalPrepData(
  documentId: string,
  userId: string
): Promise<ProfessionalPrepData> {
  const { documentId: cleanDocId, userId: cleanUserId } = PrepContextSchema.parse({
    documentId,
    userId,
  });

  // 1. Enforce strict tenant ownership (anti-oracle)
  await verifyDocumentOwnership(cleanDocId, cleanUserId);

  try {
    // 2. Fetch workspace data (document metadata + sections)
    const workspaceData = await getDocumentWorkspaceData(cleanDocId, cleanUserId);
    if (!workspaceData) {
      throw new PrepAccessError("Document not found or access denied");
    }

    const { document: doc, sections } = workspaceData;

    // Index sections for O(1) lookup
    const sectionsById = new Map<string, WorkspaceSection>();
    for (const sec of sections) {
      sectionsById.set(sec.id, sec);
    }

    // 3. Fetch validated document findings
    const findings = await getPersistedDocumentFindings(cleanDocId);

    // 4. Fetch user actions from Action Center
    const actions = await listActionsByUser({
      userId: cleanUserId,
      documentId: cleanDocId,
      status: "all",
    });

    const openActions = actions.filter((a) => a.status === "open");
    const completedActionsCount = actions.filter((a) => a.status === "completed").length;

    // 5. Fetch user questions recorded across Q&A conversations
    const userQuestions = await getUserQuestionsForDocument({
      documentId: cleanDocId,
      userId: cleanUserId,
    });

    // 6. Extract key clauses from document metadata (importantSections)
    const docMeta = (doc.metadata || {}) as Record<string, unknown>;
    const extractionMeta = (docMeta.extraction || {}) as Record<string, unknown>;
    const rawImportantSections =
      (docMeta.importantSections as ValidatedImportantSection[] | undefined) ||
      (extractionMeta.importantSections as ValidatedImportantSection[] | undefined) ||
      [];

    const keyClauses: KeyClauseItem[] = rawImportantSections.map((is) => {
      const matchedSec = is.sectionId ? sectionsById.get(is.sectionId) : undefined;
      const orderIdx = typeof is.sectionOrderIndex === "number"
        ? is.sectionOrderIndex
        : matchedSec?.orderIndex ?? 0;
      const fallbackSec = sections[orderIdx];

      return {
        sectionId: is.sectionId || fallbackSec?.id || "",
        orderIndex: orderIdx,
        sectionNumber: matchedSec?.sectionNumber ?? fallbackSec?.sectionNumber ?? orderIdx + 1,
        title: is.title || matchedSec?.title || fallbackSec?.title || `Section ${orderIdx + 1}`,
        pageStart: matchedSec?.pageStart ?? fallbackSec?.pageStart ?? null,
        pageEnd: matchedSec?.pageEnd ?? fallbackSec?.pageEnd ?? null,
        importanceReason: is.reason || undefined,
        verbatimExcerpt: matchedSec?.content ? matchedSec.content.slice(0, 300) : undefined,
      };
    });

    // 7. Group findings into meaningful review categories
    const attentionItems = findings.filter(
      (f) => f.importance === "needs_attention" && f.findingType !== "missing_information"
    );
    const ambiguitiesAndInconsistencies = findings.filter(
      (f) => f.findingType === "ambiguity" || f.findingType === "inconsistency"
    );
    const missingProvisions = findings.filter(
      (f) => f.findingType === "missing_information"
    );
    const obligationsAndTerms = findings.filter(
      (f) =>
        f.findingType === "obligation" ||
        f.findingType === "financial_term" ||
        f.findingType === "date" ||
        f.findingType === "key_term"
    );

    // 8. Derive discussion questions for counsel
    const clarificationQuestions = deriveClarificationQuestions(findings, sectionsById);

    // 9. Classification metadata
    const classificationMeta = docMeta.classification as
      | { isStatedInText?: boolean }
      | undefined;
    const isStatedType = classificationMeta?.isStatedInText === true;
    const executiveSummary = (docMeta.executiveSummary as string) || null;

    return {
      document: {
        id: doc.id,
        filename: doc.filename,
        documentType: doc.documentType ?? null,
        isStatedType,
        parties: doc.parties ?? null,
        governingLaw: doc.governingLaw ?? null,
        jurisdiction: doc.jurisdiction ?? null,
        pageCount: doc.pageCount ?? null,
        fileSizeBytes: doc.fileSizeBytes,
        createdAt: doc.createdAt,
        executiveSummary,
      },
      keyClauses,
      findingsSummary: {
        attentionItems,
        ambiguitiesAndInconsistencies,
        missingProvisions,
        obligationsAndTerms,
        totalFindingsCount: findings.length,
      },
      openActions,
      completedActionsCount,
      userQuestions,
      clarificationQuestions,
      generatedAt: new Date(),
    };
  } catch (error) {
    if (error instanceof PrepAccessError) throw error;
    throw new PrepServiceError("Failed to assemble professional prep data", {
      cause: error,
    });
  }
}

// ---------------------------------------------------------------------------
// Markdown Export Formatter
// ---------------------------------------------------------------------------

export { formatBriefingAsMarkdown } from "@/lib/prep/markdown-export";


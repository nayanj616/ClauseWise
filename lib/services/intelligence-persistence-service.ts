/**
 * Intelligence Persistence Domain Service — ClauseWise
 *
 * Persists validated document intelligence results into PostgreSQL via Drizzle ORM.
 *
 * Responsibilities:
 * - Reprocessing idempotency: wipes prior document_findings for the document before inserting
 * - Atomic transaction: findings insertion and document metadata updates succeed or roll back together
 * - Safe error handling: failure updates status to 'error' without corrupting Phase 2 sections/chunks
 * - Preserves exact verified citations, coordinates, and metadata
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  documents,
  documentFindings,
  type Document,
  type DocumentFinding,
} from "@/lib/db/schema";
import type { ValidatedIntelligenceResult } from "@/lib/intelligence/types";
import { generateAndPersistChunkEmbeddings } from "./chunk-persistence-service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class IntelligencePersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IntelligencePersistenceError";
  }
}

export interface IntelligencePersistenceResult {
  document: Document;
  findings: DocumentFinding[];
}

/**
 * Validates documentId string format (UUID).
 */
function assertValidDocumentId(documentId: string): void {
  if (!documentId || typeof documentId !== "string" || !UUID_REGEX.test(documentId.trim())) {
    throw new IntelligencePersistenceError(
      `Invalid document ID provided for intelligence persistence: ${documentId}`
    );
  }
}

/**
 * Best-effort helper to update a document status to 'error' outside of transactions.
 * If this fallback database write fails, it logs the error without masking the primary failure.
 */
async function recordDocumentErrorSafely(
  documentId: string,
  errorMessage: string
): Promise<void> {
  try {
    await db
      .update(documents)
      .set({
        status: "error",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
  } catch (fallbackError) {
    console.error(
      `[recordDocumentErrorSafely] Failed to update document status to 'error' for ${documentId}:`,
      fallbackError
    );
  }
}

/**
 * Atomically persists validated document intelligence and transitions document status to 'ready'.
 *
 * In a single database transaction:
 * 1. Verifies the document exists
 * 2. Deletes any previous document_findings for this document (idempotent replacement)
 * 3. Inserts all validated findings
 * 4. Updates document record: document_type, parties, governing_law, jurisdiction, metadata, status='ready'
 *
 * @param result - Validated intelligence result passing schema and evidence checks
 * @returns Updated document and inserted findings records
 */
export async function persistDocumentIntelligence(
  result: ValidatedIntelligenceResult
): Promise<IntelligencePersistenceResult> {
  assertValidDocumentId(result.documentId);
  const cleanDocId = result.documentId.trim();

  try {
    return await db.transaction(async (tx) => {
      // 1. Verify document exists
      const [existingDoc] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, cleanDocId))
        .limit(1);

      if (!existingDoc) {
        throw new IntelligencePersistenceError(`Document not found: ${cleanDocId}`);
      }

      // 2. Delete prior findings for this document (reprocessing idempotency)
      await tx
        .delete(documentFindings)
        .where(eq(documentFindings.documentId, cleanDocId));

      // 3. Prepare findings rows
      const findingRows = result.findings.map((f) => ({
        documentId: cleanDocId,
        sectionId: f.sectionId,
        chunkId: f.chunkId,
        findingType: f.findingType,
        importance: f.importance,
        label: f.label,
        summary: f.summary,
        sourceText: f.sourceText,
        pageNumber: f.pageNumber,
        metadata: f.metadata,
      }));

      // 4. Insert new findings (if any)
      let insertedFindings: DocumentFinding[] = [];
      if (findingRows.length > 0) {
        insertedFindings = await tx
          .insert(documentFindings)
          .values(findingRows)
          .returning();
      }

      // 5. Update document record
      const documentMetadata: Record<string, unknown> = {
        executiveSummary: result.executiveSummary,
        importantSections: result.importantSections,
        classification: result.classification,
        rejectedFindingsCount: result.rejectedFindingsCount,
        ...(result.inputBounding ? { inputBounding: result.inputBounding } : {}),
      };

      const [updatedDoc] = await tx
        .update(documents)
        .set({
          status: "ready",
          documentType: result.classification.documentType,
          parties: result.parties.map((p) => ({ name: p.name, role: p.role })),
          governingLaw: result.governingLaw?.law ?? null,
          jurisdiction: result.jurisdiction?.jurisdiction ?? null,
          metadata: documentMetadata,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, cleanDocId))
        .returning();

      if (!updatedDoc) {
        throw new IntelligencePersistenceError(
          `Failed to update document status to ready for ${cleanDocId}`
        );
      }

      return {
        document: updatedDoc,
        findings: insertedFindings,
      };
    });
  } catch (error) {
    // Record error status safely outside transaction
    await recordDocumentErrorSafely(
      cleanDocId,
      "Failed to persist document intelligence findings"
    );

    if (error instanceof IntelligencePersistenceError) {
      throw error;
    }

    throw new IntelligencePersistenceError(
      "Database transaction failed during intelligence persistence",
      { cause: error }
    );
  }
}

/**
 * Orchestrates the full document intelligence lifecycle:
 * 1. Transitions document status to 'analyzing'
 * 2. Runs analyzeDocumentIntelligence()
 * 3. Persists intelligence results via persistDocumentIntelligence()
 *
 * Invariant:
 * If an error occurs during AI analysis or persistence, Phase 2 sections and chunks
 * are left 100% untouched. Status transitions to 'error' with a safe user message.
 *
 * @param documentId - UUID of the target document
 * @returns Updated document and persisted findings
 */
export async function processDocumentIntelligence(
  documentId: string
): Promise<IntelligencePersistenceResult> {
  assertValidDocumentId(documentId);
  const cleanDocId = documentId.trim();

  // 1. Mark status as 'analyzing'
  await db
    .update(documents)
    .set({
      status: "analyzing",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, cleanDocId));

  try {
    // 2. Generate and persist chunk embeddings for semantic retrieval
    await generateAndPersistChunkEmbeddings(cleanDocId);

    // 3. Execute analysis & evidence verification
    const { analyzeDocumentIntelligence } = await import(
      "./intelligence-service"
    );
    const validatedResult = await analyzeDocumentIntelligence(cleanDocId);

    // 4. Atomically persist intelligence
    return await persistDocumentIntelligence(validatedResult);
  } catch (error) {
    // Fallback: update status to error safely without corrupting Phase 2 data
    const message =
      error instanceof Error ? error.message : "Failed to analyze document";
    await recordDocumentErrorSafely(cleanDocId, message);
    throw error;
  }
}


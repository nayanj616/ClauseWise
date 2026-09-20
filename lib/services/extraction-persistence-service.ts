/**
 * Extraction Persistence Domain Service — ClauseWise
 *
 * Persists document extraction results into PostgreSQL via Drizzle ORM.
 *
 * Responsibilities:
 * - Operates on existing documents with strict ID validation
 * - Transactionally stores extracted sections into document_sections
 * - Preserves exact section ordering, titles, and verbatim text
 * - Preserves native PDF page coordinates; ensures DOCX/TXT retain null page coordinates
 * - Reprocessing idempotency: replaces existing sections on re-extraction without duplication
 * - Enforces status transition: queued -> extracting -> ready (or error on failure)
 * - Atomic rollback: prevents partial section writes or premature 'ready' state
 * - Best-effort status update to 'error' outside transaction on failure, logging fallback errors
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  documents,
  documentSections,
  type Document,
  type DocumentSection,
} from "@/lib/db/schema";
import { downloadDocumentFile } from "@/lib/storage/storage-client";
import { extractDocumentText } from "@/lib/services/extraction-service";
import type { DocumentExtractionResult } from "@/lib/extraction/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Document not found: ${documentId}`);
    this.name = "DocumentNotFoundError";
  }
}

export class ExtractionPersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExtractionPersistenceError";
  }
}

export interface PersistenceResult {
  document: Document;
  sections: DocumentSection[];
}

/**
 * Validates documentId string format (UUID).
 */
function assertValidDocumentId(documentId: string): void {
  if (!documentId || typeof documentId !== "string" || !UUID_REGEX.test(documentId.trim())) {
    throw new ExtractionPersistenceError(
      `Invalid document ID provided for persistence: ${documentId}`
    );
  }
}

/**
 * Validates extraction result structure before persistence mutations.
 */
function assertValidExtractionResult(
  extractionResult: DocumentExtractionResult
): void {
  if (!extractionResult || typeof extractionResult !== "object") {
    throw new ExtractionPersistenceError(
      "No extraction result provided for persistence"
    );
  }

  if (!Array.isArray(extractionResult.sections) || extractionResult.sections.length === 0) {
    throw new ExtractionPersistenceError(
      "Extraction result contains no sections to persist"
    );
  }

  if (!extractionResult.text || !extractionResult.text.trim()) {
    throw new ExtractionPersistenceError(
      "Extraction result contains no text content"
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
 * Atomically persists extracted sections and updates document metadata to 'ready'.
 *
 * In a single database transaction:
 * 1. Verifies the document exists
 * 2. Deletes any prior sections for this document (idempotent replacement)
 * 3. Inserts all new sections preserving sequential order, titles, text, and page coordinates
 * 4. Updates document status to 'ready' and records pageCount
 *
 * If any error occurs:
 * - Transaction rolls back entirely (no partial sections or invalid 'ready' state)
 * - Outside the transaction, a best-effort update sets status to 'error'
 * - Throws the sanitized persistence error
 *
 * @param documentId - Valid UUID of the target document
 * @param extractionResult - Factual extraction result from extraction service
 * @returns Updated document and inserted section records
 */
export async function persistDocumentExtraction(
  documentId: string,
  extractionResult: DocumentExtractionResult
): Promise<PersistenceResult> {
  assertValidDocumentId(documentId);
  assertValidExtractionResult(extractionResult);

  const cleanDocId = documentId.trim();

  try {
    return await db.transaction(async (tx) => {
      // 1. Verify document existence within the transaction
      const [existingDoc] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, cleanDocId))
        .limit(1);

      if (!existingDoc) {
        throw new DocumentNotFoundError(cleanDocId);
      }

      // 2. Remove previous sections (idempotent replacement / reprocessing)
      await tx
        .delete(documentSections)
        .where(eq(documentSections.documentId, cleanDocId));

      // 3. Prepare section rows preserving sequence, titles, text, and coordinates
      const sectionRows = extractionResult.sections.map((sec) => ({
        documentId: cleanDocId,
        orderIndex: sec.orderIndex,
        sectionNumber: sec.orderIndex,
        title: sec.title,
        content: sec.text,
        pageStart: typeof sec.pageStart === "number" ? sec.pageStart : null,
        pageEnd: typeof sec.pageEnd === "number" ? sec.pageEnd : null,
      }));

      // 4. Insert new sections
      const insertedSections = await tx
        .insert(documentSections)
        .values(sectionRows)
        .returning();

      // 5. Update document extraction metadata and transition to 'ready'
      const [updatedDoc] = await tx
        .update(documents)
        .set({
          status: "ready",
          pageCount:
            typeof extractionResult.pageCount === "number"
              ? extractionResult.pageCount
              : null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, cleanDocId))
        .returning();

      if (!updatedDoc) {
        throw new ExtractionPersistenceError(
          `Failed to update document status to ready for ${cleanDocId}`
        );
      }

      return {
        document: updatedDoc,
        sections: insertedSections,
      };
    });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      throw error;
    }

    // Best-effort status update after rollback
    await recordDocumentErrorSafely(
      cleanDocId,
      "Failed to persist document extraction"
    );

    if (error instanceof ExtractionPersistenceError) {
      throw error;
    }

    throw new ExtractionPersistenceError(
      "Database transaction failed during extraction persistence",
      { cause: error }
    );
  }
}

/**
 * Orchestrates the full document extraction and persistence lifecycle for an existing document:
 *
 * Lifecycle:
 * 1. Retrieve existing document record from DB
 * 2. Update status -> 'extracting'
 * 3. Retrieve stored file buffer from Supabase Storage
 * 4. Execute extractDocumentText()
 * 5. Atomically persistDocumentExtraction() -> status becomes 'ready'
 *
 * Failure contract:
 * - Transaction rollback ensures no partial sections or premature 'ready' status
 * - Best-effort update sets status to 'error' outside transaction
 * - Any failure in the fallback status update is logged without hiding the root cause
 * - Throws a safe, sanitized error
 *
 * @param documentId - UUID of the document to process
 * @returns Updated document record and persisted sections
 */
export async function processDocumentExtraction(
  documentId: string
): Promise<PersistenceResult> {
  assertValidDocumentId(documentId);
  const cleanDocId = documentId.trim();

  // 1. Retrieve document record
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, cleanDocId))
    .limit(1);

  if (!doc) {
    throw new DocumentNotFoundError(cleanDocId);
  }

  // 2. Mark document as actively extracting
  await db
    .update(documents)
    .set({
      status: "extracting",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, cleanDocId));

  // 3. Retrieve stored file from private storage
  let buffer: Buffer;
  try {
    buffer = await downloadDocumentFile(doc.storagePath);
  } catch (storageError) {
    await recordDocumentErrorSafely(
      cleanDocId,
      "Failed to retrieve stored document file"
    );
    throw storageError;
  }

  // 4. Run document extraction engine
  let extractionResult: DocumentExtractionResult;
  try {
    extractionResult = await extractDocumentText({
      buffer,
      mimeType: doc.mimeType,
      filename: doc.originalFilename,
    });
  } catch (extractionError) {
    await recordDocumentErrorSafely(
      cleanDocId,
      "Failed to extract text from document file"
    );
    throw extractionError;
  }

  // 5. Persist extraction result atomically
  return await persistDocumentExtraction(cleanDocId, extractionResult);
}


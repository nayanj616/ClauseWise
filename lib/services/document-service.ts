/**
 * Document Domain Service — ClauseWise
 *
 * Encapsulates all document domain logic:
 * - Validating uploads
 * - Uploading to private Supabase Storage
 * - Creating database records with verified user ownership
 * - Rolling back storage on database failure to prevent orphaned objects
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { db } from "@/lib/db";
import { documents, type Document } from "@/lib/db/schema";
import {
  uploadDocumentFile,
  deleteDocumentFile,
} from "@/lib/storage/storage-client";
import {
  validateDocumentUpload,
  type DocumentUploadInput,
  type ValidatedDocumentFile,
} from "@/lib/validation/document-validation";
import {
  processDocumentExtraction,
  persistDocumentExtraction,
  DocumentNotFoundError,
  ExtractionPersistenceError,
  type PersistenceResult,
} from "./extraction-persistence-service";

export {
  persistDocumentExtraction,
  processDocumentExtraction,
  DocumentNotFoundError,
  ExtractionPersistenceError,
  type PersistenceResult,
};

export class DatabaseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseError";
  }
}

export interface UploadDocumentServiceInput {
  userId: string;
  file: File | { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
  /**
   * Whether to synchronously trigger document extraction and persistence.
   * When true, transitions document queued -> extracting -> ready (or error).
   * Defaults to false for backwards compatibility with Phase 1 caller contracts.
   */
  processExtraction?: boolean;
}

/**
 * Uploads a document to private storage and creates the database record:
 * 1. Validates file (size, MIME, extension, signatures) — fails before mutations
 * 2. Uploads file to private Supabase Storage
 * 3. Creates Document record in database with initial status 'queued'
 * 4. Optionally processes extraction synchronously (status -> extracting -> ready)
 * 5. Rolls back storage object if database insert fails
 *
 * @param input.userId - The authenticated session user ID (never from client body)
 * @param input.file - The uploaded file object
 * @param input.processExtraction - If true, synchronously processes extraction and persists sections
 * @returns The created (or processed) Document record
 */
export async function uploadDocument(
  input: UploadDocumentServiceInput
): Promise<Document> {
  // 1. Validate file (throws DocumentValidationError before any side effects)
  const validated: ValidatedDocumentFile = await validateDocumentUpload({
    file: input.file,
    userId: input.userId,
  });

  // 2. Upload to private Supabase Storage
  await uploadDocumentFile(
    validated.storagePath,
    validated.buffer,
    validated.mimeType
  );

  // 3. Create Document record in PostgreSQL
  let createdDoc: Document;
  try {
    const [doc] = await db
      .insert(documents)
      .values({
        id: validated.documentId,
        userId: input.userId, // Authenticated session identity ONLY
        title: validated.title,
        originalFilename: validated.originalFilename,
        storagePath: validated.storagePath,
        mimeType: validated.mimeType,
        fileSizeBytes: validated.fileSizeBytes,
        status: "queued",
      })
      .returning();

    if (!doc) {
      throw new Error("Insert succeeded but returned no rows");
    }

    createdDoc = doc;
  } catch (dbError) {
    // 4. Failure rollback: Remove storage object to avoid leaving orphaned files
    console.error(
      `[uploadDocument] Database insertion failed for document ${validated.documentId}. Rolling back storage...`,
      dbError
    );

    try {
      await deleteDocumentFile(validated.storagePath);
    } catch (cleanupError) {
      console.error(
        `[uploadDocument] Storage cleanup failed for ${validated.storagePath}:`,
        cleanupError
      );
    }

    throw new DatabaseError("Failed to create document record in database", {
      cause: dbError,
    });
  }

  // 5. If requested, synchronously process extraction and section persistence
  if (input.processExtraction) {
    const extractionResult = await processDocumentExtraction(createdDoc.id);
    return extractionResult.document;
  }

  return createdDoc;
}


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

export class DatabaseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseError";
  }
}

export interface UploadDocumentServiceInput {
  userId: string;
  file: File | { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
}

/**
 * Uploads a document to private storage and creates the database record:
 * 1. Validates file (size, MIME, extension, signatures) — fails before mutations
 * 2. Uploads file to private Supabase Storage
 * 3. Creates Document record in database with initial status 'queued'
 * 4. Rolls back storage object if database insert fails
 *
 * @param input.userId - The authenticated session user ID (never from client body)
 * @param input.file - The uploaded file object
 * @returns The created Document record
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
  try {
    const [createdDoc] = await db
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

    if (!createdDoc) {
      throw new Error("Insert succeeded but returned no rows");
    }

    return createdDoc;
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
}


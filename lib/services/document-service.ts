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

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  documents,
  documentSections,
  type Document,
  type DocumentStatus,
} from "@/lib/db/schema";
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
import {
  processDocumentIntelligence,
  persistDocumentIntelligence,
  IntelligencePersistenceError,
  type IntelligencePersistenceResult,
} from "./intelligence-persistence-service";
import {
  getDocumentChunks,
  deleteDocumentChunks,
  persistDocumentChunks,
  generateAndPersistChunkEmbeddings,
  ChunkPersistenceError,
} from "./chunk-persistence-service";

export {
  persistDocumentExtraction,
  processDocumentExtraction,
  processDocumentIntelligence,
  persistDocumentIntelligence,
  DocumentNotFoundError,
  ExtractionPersistenceError,
  IntelligencePersistenceError,
  type PersistenceResult,
  type IntelligencePersistenceResult,
  getDocumentChunks,
  deleteDocumentChunks,
  persistDocumentChunks,
  generateAndPersistChunkEmbeddings,
  ChunkPersistenceError,
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
   * Whether to synchronously trigger document extraction and intelligence.
   * When true, transitions document queued -> extracting -> analyzing -> ready (or error).
   * Defaults to false for backwards compatibility with Phase 1 caller contracts.
   */
  processExtraction?: boolean;
}

/**
 * Uploads a document to private storage and creates the database record:
 * 1. Validates file (size, MIME, extension, signatures) — fails before mutations
 * 2. Uploads file to private Supabase Storage
 * 3. Creates Document record in database with initial status 'queued'
 * 4. Optionally processes extraction and intelligence synchronously (queued -> extracting -> analyzing -> ready)
 * 5. Rolls back storage object if database insert fails
 *
 * @param input.userId - The authenticated session user ID (never from client body)
 * @param input.file - The uploaded file object
 * @param input.processExtraction - If true, synchronously processes extraction, chunking, and intelligence
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

  // 5. If requested, synchronously process extraction, chunking, and intelligence
  if (input.processExtraction) {
    await processDocumentExtraction(createdDoc.id);
    const intelligenceResult = await processDocumentIntelligence(createdDoc.id);
    return intelligenceResult.document;
  }

  return createdDoc;
}

// ---------------------------------------------------------------------------
// Document Workspace Data Contracts & Service (Phase 2 Slice 2.3)
// ---------------------------------------------------------------------------

export interface WorkspaceDocument {
  id: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  documentType?: string | null;
  status: DocumentStatus;
  pageCount?: number | null;
  createdAt: Date;
  updatedAt: Date;
  errorMessage?: string | null;
  governingLaw?: string | null;
  jurisdiction?: string | null;
  parties?: Array<{ name: string; role: string | null }> | null;
  metadata?: Record<string, unknown> | null;
}

export interface WorkspaceSection {
  id: string;
  orderIndex: number;
  sectionNumber: number | null;
  title: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
}

export interface DocumentWorkspaceData {
  document: WorkspaceDocument;
  sections: WorkspaceSection[];
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loads a document and its persisted sections for the Document Workspace.
 * Strictly scopes query by documentId AND userId for access security.
 * Excludes storagePath and internal database details.
 *
 * @param documentId - Target document UUID
 * @param userId - Authenticated user UUID (strictly required)
 * @returns DocumentWorkspaceData or null if not found or unauthorized
 */
export async function getDocumentWorkspaceData(
  documentId: string,
  userId: string
): Promise<DocumentWorkspaceData | null> {
  // Validate inputs before querying
  if (
    !documentId ||
    typeof documentId !== "string" ||
    !UUID_REGEX.test(documentId.trim())
  ) {
    return null;
  }

  if (!userId || typeof userId !== "string" || !userId.trim()) {
    return null;
  }

  const cleanDocId = documentId.trim();
  const cleanUserId = userId.trim();

  try {
    // 1. Query document record scoped strictly by id AND userId
    const [doc] = await db
      .select({
        id: documents.id,
        title: documents.title,
        originalFilename: documents.originalFilename,
        mimeType: documents.mimeType,
        fileSizeBytes: documents.fileSizeBytes,
        status: documents.status,
        pageCount: documents.pageCount,
        errorMessage: documents.errorMessage,
        documentType: documents.documentType,
        governingLaw: documents.governingLaw,
        jurisdiction: documents.jurisdiction,
        parties: documents.parties,
        metadata: documents.metadata,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, cleanDocId),
          eq(documents.userId, cleanUserId)
        )
      )
      .limit(1);

    if (!doc) {
      return null;
    }

    // 2. Query persisted sections ordered by orderIndex ASC
    const sections = await db
      .select({
        id: documentSections.id,
        orderIndex: documentSections.orderIndex,
        sectionNumber: documentSections.sectionNumber,
        title: documentSections.title,
        content: documentSections.content,
        pageStart: documentSections.pageStart,
        pageEnd: documentSections.pageEnd,
      })
      .from(documentSections)
      .where(eq(documentSections.documentId, cleanDocId))
      .orderBy(asc(documentSections.orderIndex));

    return {
      document: {
        id: doc.id,
        filename: doc.originalFilename || doc.title,
        mimeType: doc.mimeType,
        fileSizeBytes: doc.fileSizeBytes,
        documentType: doc.documentType ?? null,
        status: doc.status,
        pageCount: doc.pageCount,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        errorMessage: doc.errorMessage,
        governingLaw: doc.governingLaw ?? null,
        jurisdiction: doc.jurisdiction ?? null,
        parties: doc.parties ?? null,
        metadata: doc.metadata ?? null,
      },
      sections: sections.map((s) => ({
        id: s.id,
        orderIndex: s.orderIndex,
        sectionNumber: s.sectionNumber,
        title: s.title,
        content: s.content,
        pageStart: s.pageStart,
        pageEnd: s.pageEnd,
      })),
    };
  } catch (error) {
    console.error(`[getDocumentWorkspaceData] Database error for doc ${cleanDocId}:`, error);
    throw new DatabaseError("Failed to retrieve document workspace data", {
      cause: error,
    });
  }
}

/**
 * Lists documents owned by the authenticated user for selection in Compare and other views.
 * Strictly filters by userId (anti-oracle tenant isolation).
 *
 * @param userId - Authenticated user UUID
 * @returns Array of user documents sorted by createdAt DESC
 */
export async function listUserDocuments(
  userId: string
): Promise<Array<{
  id: string;
  title: string;
  originalFilename: string | null;
  status: DocumentStatus;
  documentType: string | null;
  pageCount: number | null;
  createdAt: Date;
}>> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    return [];
  }

  const cleanUserId = userId.trim();

  try {
    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        originalFilename: documents.originalFilename,
        status: documents.status,
        documentType: documents.documentType,
        pageCount: documents.pageCount,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.userId, cleanUserId))
      .orderBy(desc(documents.createdAt));

    return rows;
  } catch (error) {
    console.error(`[listUserDocuments] Database error for user ${cleanUserId}:`, error);
    throw new DatabaseError("Failed to list user documents", { cause: error });
  }
}


/**
 * Retrieval Domain Service — ClauseWise (Phase 4 Slice 4.1)
 *
 * Domain service boundary for retrieving persisted findings and their evidence
 * for authenticated document owners.
 *
 * Invariants:
 * 1. Strict ownership enforcement: Every retrieval checks ownership against userId.
 * 2. Safe unauthorized handling: Cross-user or nonexistent queries return safe empty/null values.
 * 3. Evidence contract:
 *    - Substantive findings retain sourceText, sectionId, and pageNumber.
 *    - missing_information findings have sourceText: null, sectionId: null (never fabricated).
 * 4. Error masking: Unexpected database errors are caught and re-thrown as DatabaseError
 *    without leaking connection strings, credentials, or internal details.
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { and, asc, eq, ne, isNotNull, sql, cosineDistance } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  documents,
  documentSections,
  documentChunks,
  documentFindings,
  FINDING_TYPES,
  type DocumentFinding,
  type DocumentSection,
  type DocumentChunk,
  type FindingType,
} from "@/lib/db/schema";

export class DatabaseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseError";
  }
}

// ---------------------------------------------------------------------------
// Phase 5.1 Retrieval Errors
// ---------------------------------------------------------------------------

export class RetrievalError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RetrievalError";
  }
}

export class RetrievalValidationError extends RetrievalError {
  readonly issues?: z.ZodIssue[];
  constructor(message: string, issues?: z.ZodIssue[]) {
    super(message);
    this.name = "RetrievalValidationError";
    this.issues = issues;
  }
}

export class DocumentAccessError extends RetrievalError {
  constructor(message = "Document not found or access denied") {
    super(message);
    this.name = "DocumentAccessError";
  }
}

export class EmbeddingError extends RetrievalError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmbeddingError";
  }
}

export class VectorSearchError extends RetrievalError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "VectorSearchError";
  }
}

// ---------------------------------------------------------------------------
// Phase 5.1 Retrieval Contracts & Schemas
// ---------------------------------------------------------------------------

export const RetrievalConfigSchema = z.object({
  /** Maximum number of chunks to retrieve (default: 5, range: 1..20) */
  topK: z.number().int().min(1).max(20).default(5),
  /** Minimum cosine similarity threshold [0.0..1.0] (default: 0.2) */
  minSimilarity: z.number().min(0).max(1).default(0.2),
});

export const DocumentRetrievalInputSchema = z.object({
  documentId: z.string().uuid("Invalid document ID format"),
  userId: z.string().trim().min(1, "User ID is required"),
  question: z
    .string()
    .trim()
    .min(1, "Question must not be empty")
    .max(2000, "Question must not exceed 2000 characters"),
  sectionId: z.string().uuid("Invalid section ID format").optional().nullable(),
  config: RetrievalConfigSchema.optional().default({}),
});

export type RetrievalConfig = z.infer<typeof RetrievalConfigSchema>;
export type DocumentRetrievalInput = z.input<typeof DocumentRetrievalInputSchema>;

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  sectionId: string | null;
  content: string;
  pageNumber: number | null;
  similarity: number;
  chunkIndex: number;
  tokenCount: number | null;
}

export interface RetrievalResult {
  documentId: string;
  question: string;
  chunks: RetrievedChunk[];
  hasSufficientEvidence: boolean;
  totalChunksExamined: number;
  sectionId?: string | null;
  targetSectionTitle?: string | null;
  fallbackUsed?: boolean;
}

export interface FindingWithEvidence {
  finding: DocumentFinding;
  section: DocumentSection | null;
  chunk: DocumentChunk | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id.trim());
}

function isValidUserId(userId: unknown): userId is string {
  return typeof userId === "string" && userId.trim().length > 0;
}

function isValidFindingType(type: unknown): type is FindingType {
  return (
    typeof type === "string" &&
    (FINDING_TYPES as readonly string[]).includes(type.trim())
  );
}

/**
 * Retrieves all persisted findings for a document owned by the specified user.
 *
 * Enforces ownership: only returns findings if the document is owned by userId.
 * Preserves canonical ordering: pageNumber ASC NULLS LAST, createdAt ASC.
 *
 * @param documentId - Target document UUID
 * @param userId - Authenticated user ID
 * @returns Array of DocumentFinding records, or empty array if unauthorized/not found/invalid
 */
export async function findingsByDocument(
  documentId: string,
  userId: string
): Promise<DocumentFinding[]> {
  if (!isValidUuid(documentId) || !isValidUserId(userId)) {
    return [];
  }

  const cleanDocId = documentId.trim();
  const cleanUserId = userId.trim();

  try {
    // 1. Verify document exists and belongs to authenticated user
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, cleanDocId),
          eq(documents.userId, cleanUserId)
        )
      )
      .limit(1);

    if (!doc) {
      return [];
    }

    // 2. Query findings ordered canonically
    return await db
      .select()
      .from(documentFindings)
      .where(eq(documentFindings.documentId, cleanDocId))
      .orderBy(asc(documentFindings.pageNumber), asc(documentFindings.createdAt));
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    console.error(`[findingsByDocument] Database error for doc ${cleanDocId}:`, error);
    throw new DatabaseError("Failed to retrieve document findings", {
      cause: error,
    });
  }
}

/**
 * Retrieves persisted findings filtered by findingType for a document owned by the specified user.
 *
 * Enforces ownership: only returns findings if the document is owned by userId.
 * Preserves canonical ordering: pageNumber ASC NULLS LAST, createdAt ASC.
 *
 * @param documentId - Target document UUID
 * @param findingType - Canonical finding type category
 * @param userId - Authenticated user ID
 * @returns Filtered array of DocumentFinding records, or empty array if unauthorized/not found/invalid
 */
export async function findingsByType(
  documentId: string,
  findingType: FindingType,
  userId: string
): Promise<DocumentFinding[]> {
  if (
    !isValidUuid(documentId) ||
    !isValidUserId(userId) ||
    !isValidFindingType(findingType)
  ) {
    return [];
  }

  const cleanDocId = documentId.trim();
  const cleanUserId = userId.trim();
  const cleanType = findingType.trim() as FindingType;

  try {
    // 1. Verify document exists and belongs to authenticated user
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, cleanDocId),
          eq(documents.userId, cleanUserId)
        )
      )
      .limit(1);

    if (!doc) {
      return [];
    }

    // 2. Query findings filtered by type and ordered canonically
    return await db
      .select()
      .from(documentFindings)
      .where(
        and(
          eq(documentFindings.documentId, cleanDocId),
          eq(documentFindings.findingType, cleanType)
        )
      )
      .orderBy(asc(documentFindings.pageNumber), asc(documentFindings.createdAt));
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    console.error(
      `[findingsByType] Database error for doc ${cleanDocId}, type ${cleanType}:`,
      error
    );
    throw new DatabaseError("Failed to retrieve document findings by type", {
      cause: error,
    });
  }
}

/**
 * Retrieves a single finding along with its source section and chunk evidence.
 *
 * Enforces ownership: verifies the finding belongs to a document owned by userId.
 * Preserves evidence invariants:
 * - Substantive finding: returns associated section and chunk (if linked).
 * - missing_information: returns section: null, chunk: null (no fabricated citations).
 *
 * @param findingId - Target finding UUID
 * @param userId - Authenticated user ID
 * @returns FindingWithEvidence object or null if unauthorized/not found/invalid
 */
export async function findingWithEvidence(
  findingId: string,
  userId: string
): Promise<FindingWithEvidence | null> {
  if (!isValidUuid(findingId) || !isValidUserId(userId)) {
    return null;
  }

  const cleanFindingId = findingId.trim();
  const cleanUserId = userId.trim();

  try {
    // 1. Fetch the finding
    const [finding] = await db
      .select()
      .from(documentFindings)
      .where(eq(documentFindings.id, cleanFindingId))
      .limit(1);

    if (!finding) {
      return null;
    }

    // 2. Verify ownership of the parent document
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, finding.documentId),
          eq(documents.userId, cleanUserId)
        )
      )
      .limit(1);

    if (!doc) {
      return null;
    }

    // 3. For missing_information, strictly no fabricated section or chunk
    if (finding.findingType === "missing_information" || !finding.sectionId) {
      return {
        finding,
        section: null,
        chunk: null,
      };
    }

    // 4. Resolve source section and optional chunk
    let section: DocumentSection | null = null;
    let chunk: DocumentChunk | null = null;

    const queries: Promise<void>[] = [];

    // Query section with cross-document isolation check (documentId must match)
    queries.push(
      db
        .select()
        .from(documentSections)
        .where(
          and(
            eq(documentSections.id, finding.sectionId),
            eq(documentSections.documentId, finding.documentId)
          )
        )
        .limit(1)
        .then(([sec]) => {
          section = sec ?? null;
        })
    );

    // Query chunk if linked with cross-document isolation check
    if (finding.chunkId) {
      queries.push(
        db
          .select()
          .from(documentChunks)
          .where(
            and(
              eq(documentChunks.id, finding.chunkId),
              eq(documentChunks.documentId, finding.documentId)
            )
          )
          .limit(1)
          .then(([chk]) => {
            chunk = chk ?? null;
          })
      );
    }

    await Promise.all(queries);

    return {
      finding,
      section,
      chunk,
    };
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    console.error(
      `[findingWithEvidence] Database error for finding ${cleanFindingId}:`,
      error
    );
    throw new DatabaseError("Failed to retrieve finding with evidence", {
      cause: error,
    });
  }
}

// ---------------------------------------------------------------------------
// Error Sanitization Helper
// ---------------------------------------------------------------------------

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
      .replace(/sk-[a-zA-Z0-9_\-]{15,}/gi, "[REDACTED_API_KEY]")
      .replace(/postgres:\/\/[^@]+@/gi, "postgres://[REDACTED]@")
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");
  }
  return "Unknown error";
}

// ---------------------------------------------------------------------------
// Phase 5.1 Retrieval Service: Evidence Retrieval via pgvector
// ---------------------------------------------------------------------------

/**
 * Retrieves relevant document chunks for a question using pgvector cosine similarity search.
 *
 * Invariants:
 * 1. Strict Tenant Authorization: Verifies document ownership against userId before any embedding
 *    or vector query. Does not leak document existence across tenants.
 * 2. Strict Document Isolation: Chunks are filtered by documentId, preventing cross-document leakage.
 * 3. Honest Evidence Boundary: Distinguishes between query failures (VectorSearchError) and
 *    zero chunks / below-threshold chunks ({ hasSufficientEvidence: false, chunks: [] }).
 *    Never silently falls back to general LLM knowledge.
 * 4. Citation Preservation: Every returned chunk retains chunkId, documentId, sectionId,
 *    pageNumber, content, similarity score, and chunkIndex for downstream citation generation.
 *
 * @param rawInput - Document ID, user ID, user question, and optional retrieval config
 * @returns Structured RetrievalResult containing ranked evidence chunks
 */
export async function retrieveDocumentEvidence(
  rawInput: DocumentRetrievalInput
): Promise<RetrievalResult> {
  // 1. Zod input validation
  const parseResult = DocumentRetrievalInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const issueMessages = parseResult.error.issues.map((i) => i.message).join("; ");
    throw new RetrievalValidationError(
      `Invalid retrieval input: ${issueMessages}`,
      parseResult.error.issues
    );
  }

  const { documentId, userId, question, sectionId, config } = parseResult.data;
  const topK = config.topK ?? 5;
  const minSimilarity = config.minSimilarity ?? 0.2;

  // 2. Ownership & Tenant Authorization Boundary
  // Query document strictly scoped by documentId AND userId.
  // CRITICAL SECURITY RULE: Return identical sanitized error for "not found"
  // and "not owned" to prevent becoming a document-existence oracle.
  let doc: { id: string } | undefined;
  try {
    const [foundDoc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.userId, userId)
        )
      )
      .limit(1);
    doc = foundDoc;
  } catch (error) {
    console.error(
      `[retrieveDocumentEvidence] DB error checking ownership for doc ${documentId}:`,
      sanitizeError(error)
    );
    throw new VectorSearchError("Failed to verify document access", { cause: error });
  }

  if (!doc) {
    throw new DocumentAccessError("Document not found or access denied");
  }

  // 2b. Section Authorization Boundary (when sectionId is provided)
  let targetSection: { id: string; title: string } | undefined;
  if (sectionId) {
    try {
      const [foundSec] = await db
        .select({ id: documentSections.id, title: documentSections.title })
        .from(documentSections)
        .where(
          and(
            eq(documentSections.id, sectionId),
            eq(documentSections.documentId, documentId)
          )
        )
        .limit(1);
      targetSection = foundSec;
    } catch (error) {
      console.error(
        `[retrieveDocumentEvidence] DB error checking section for doc ${documentId}, section ${sectionId}:`,
        sanitizeError(error)
      );
      throw new VectorSearchError("Failed to verify section access", { cause: error });
    }

    if (!targetSection) {
      // Anti-oracle protection for section: Return uniform DocumentAccessError
      throw new DocumentAccessError("Section not found or access denied");
    }
  }

  // 3. Question Embedding via 768-dimensional embedding client (nomic-embed-text)
  let queryEmbedding: number[];
  try {
    const { embedText } = await import("@/lib/embeddings/embeddings-client");
    queryEmbedding = await embedText(question);
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
      throw new Error(
        `Query embedding dimension mismatch: expected 768 dimensions for vector(768), received ${Array.isArray(queryEmbedding) ? queryEmbedding.length : 0}`
      );
    }
  } catch (error) {
    console.error(
      `[retrieveDocumentEvidence] Embedding failed for doc ${documentId}:`,
      sanitizeError(error)
    );
    throw new EmbeddingError("Failed to generate embedding for retrieval question", {
      cause: error,
    });
  }

  // 4. pgvector Similarity Search with Strict Document Isolation
  const distanceExpr = cosineDistance(documentChunks.embedding, queryEmbedding);
  const similarityExpr = sql<number>`1 - (${distanceExpr})`;

  function evaluateChunks(
    rowsToEval: Array<{
      chunkId: string;
      documentId: string;
      sectionId: string;
      content: string;
      pageNumber: number | null;
      tokenCount: number | null;
      chunkIndex: number;
      similarity: unknown;
    }>
  ): RetrievedChunk[] {
    const qualified: RetrievedChunk[] = [];
    for (const row of rowsToEval) {
      const rawSim = Number(row.similarity);
      const similarity = isNaN(rawSim)
        ? 0
        : Math.max(-1, Math.min(1, Math.round(rawSim * 10000) / 10000));

      if (similarity >= minSimilarity) {
        qualified.push({
          chunkId: row.chunkId,
          documentId: row.documentId,
          sectionId: row.sectionId ?? null,
          content: row.content,
          pageNumber: row.pageNumber,
          similarity,
          chunkIndex: row.chunkIndex,
          tokenCount: row.tokenCount,
        });
      }
    }
    return qualified;
  }

  // Contextual targeted retrieval when sectionId is specified
  if (sectionId) {
    let sectionRows: Array<{
      chunkId: string;
      documentId: string;
      sectionId: string;
      content: string;
      pageNumber: number | null;
      tokenCount: number | null;
      chunkIndex: number;
      similarity: unknown;
    }>;

    try {
      sectionRows = await db
        .select({
          chunkId: documentChunks.id,
          documentId: documentChunks.documentId,
          sectionId: documentChunks.sectionId,
          content: documentChunks.content,
          pageNumber: documentChunks.pageNumber,
          tokenCount: documentChunks.tokenCount,
          chunkIndex: documentChunks.chunkIndex,
          similarity: similarityExpr,
        })
        .from(documentChunks)
        .where(
          and(
            eq(documentChunks.documentId, documentId),
            eq(documentChunks.sectionId, sectionId),
            isNotNull(documentChunks.embedding)
          )
        )
        .orderBy(asc(distanceExpr))
        .limit(topK);
    } catch (error) {
      console.error(
        `[retrieveDocumentEvidence] Section vector search failed on doc ${documentId}, section ${sectionId}:`,
        sanitizeError(error)
      );
      throw new VectorSearchError("Failed to query document chunks via vector similarity", {
        cause: error,
      });
    }

    const sectionQualifiedChunks = evaluateChunks(sectionRows);

    if (sectionQualifiedChunks.length > 0) {
      return {
        documentId,
        sectionId,
        targetSectionTitle: targetSection?.title ?? null,
        question,
        chunks: sectionQualifiedChunks,
        hasSufficientEvidence: true,
        totalChunksExamined: sectionRows.length,
        fallbackUsed: false,
      };
    }

    // Selected section did not contain sufficient evidence -> fallback to remainder of the same document
    let fallbackRows: typeof sectionRows = [];
    try {
      fallbackRows = await db
        .select({
          chunkId: documentChunks.id,
          documentId: documentChunks.documentId,
          sectionId: documentChunks.sectionId,
          content: documentChunks.content,
          pageNumber: documentChunks.pageNumber,
          tokenCount: documentChunks.tokenCount,
          chunkIndex: documentChunks.chunkIndex,
          similarity: similarityExpr,
        })
        .from(documentChunks)
        .where(
          and(
            eq(documentChunks.documentId, documentId),
            ne(documentChunks.sectionId, sectionId),
            isNotNull(documentChunks.embedding)
          )
        )
        .orderBy(asc(distanceExpr))
        .limit(topK);
    } catch (error) {
      console.error(
        `[retrieveDocumentEvidence] Fallback vector search failed on doc ${documentId}:`,
        sanitizeError(error)
      );
      throw new VectorSearchError("Failed to query fallback document chunks via vector similarity", {
        cause: error,
      });
    }

    const fallbackQualifiedChunks = evaluateChunks(fallbackRows);

    if (fallbackQualifiedChunks.length > 0) {
      return {
        documentId,
        sectionId,
        targetSectionTitle: targetSection?.title ?? null,
        question,
        chunks: fallbackQualifiedChunks,
        hasSufficientEvidence: true,
        totalChunksExamined: sectionRows.length + fallbackRows.length,
        fallbackUsed: true,
      };
    }

    return {
      documentId,
      sectionId,
      targetSectionTitle: targetSection?.title ?? null,
      question,
      chunks: [],
      hasSufficientEvidence: false,
      totalChunksExamined: sectionRows.length + fallbackRows.length,
      fallbackUsed: false,
    };
  }

  // Document-wide retrieval (standard Phase 5 behavior when sectionId is not specified)
  let rows: Array<{
    chunkId: string;
    documentId: string;
    sectionId: string;
    content: string;
    pageNumber: number | null;
    tokenCount: number | null;
    chunkIndex: number;
    similarity: unknown;
  }>;

  try {
    rows = await db
      .select({
        chunkId: documentChunks.id,
        documentId: documentChunks.documentId,
        sectionId: documentChunks.sectionId,
        content: documentChunks.content,
        pageNumber: documentChunks.pageNumber,
        tokenCount: documentChunks.tokenCount,
        chunkIndex: documentChunks.chunkIndex,
        similarity: similarityExpr,
      })
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          isNotNull(documentChunks.embedding)
        )
      )
      .orderBy(asc(distanceExpr))
      .limit(topK);
  } catch (error) {
    console.error(
      `[retrieveDocumentEvidence] Vector search failed on doc ${documentId}:`,
      sanitizeError(error)
    );
    throw new VectorSearchError("Failed to query document chunks via vector similarity", {
      cause: error,
    });
  }

  // 5. Zero indexed/embedded chunks: Normal retrieval outcome (not an error)
  if (!rows || rows.length === 0) {
    return {
      documentId,
      question,
      chunks: [],
      hasSufficientEvidence: false,
      totalChunksExamined: 0,
      sectionId: null,
      targetSectionTitle: null,
      fallbackUsed: false,
    };
  }

  // 6. Thresholding & relevance evaluation
  const qualifiedChunks = evaluateChunks(rows);

  return {
    documentId,
    question,
    chunks: qualifiedChunks,
    hasSufficientEvidence: qualifiedChunks.length > 0,
    totalChunksExamined: rows.length,
    sectionId: null,
    targetSectionTitle: null,
    fallbackUsed: false,
  };
}

/**
 * Alias for retrieveDocumentEvidence matching the Phase 5 specification.
 */
export const semanticSearch = retrieveDocumentEvidence;


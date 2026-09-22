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

import { and, asc, eq } from "drizzle-orm";
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

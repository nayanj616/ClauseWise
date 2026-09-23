/**
 * Action Domain Service — ClauseWise (Phase 7)
 *
 * Manages legal review action items derived from document findings.
 * Lifecycle: open <-> completed.
 *
 * Security & Anti-Oracle Invariants:
 * 1. Strict Tenant Isolation on Every Operation:
 *    - All operations verify actions.userId === userId AND document.userId === userId.
 * 2. Finding-Document Provenance Integrity:
 *    - Any linked finding must belong to the same document (finding.documentId === documentId).
 * 3. Anti-Oracle Protection:
 *    - Non-existent, mismatched, or unauthorized documents/findings/actions throw uniform ActionAccessError.
 * 4. Completed At Tracking:
 *    - completedAt is set to timestamp when transitioned to "completed".
 *    - completedAt is cleared (null) when transitioned back to "open".
 *
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  actions,
  documents,
  documentFindings,
  documentSections,
  type Action,
  type ActionStatus,
  ACTION_STATUSES,
  type FindingImportance,
  type FindingType,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Domain Errors
// ---------------------------------------------------------------------------

export class ActionServiceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ActionServiceError";
  }
}

export class ActionAccessError extends ActionServiceError {
  constructor(message = "Action not found or access denied") {
    super(message);
    this.name = "ActionAccessError";
  }
}

export class ActionValidationError extends ActionServiceError {
  constructor(message: string) {
    super(message);
    this.name = "ActionValidationError";
  }
}

// ---------------------------------------------------------------------------
// Types & Input Interfaces
// ---------------------------------------------------------------------------

export interface ActionWithDetails extends Action {
  document: {
    id: string;
    title: string;
    originalFilename: string;
  };
  finding?: {
    id: string;
    findingType: FindingType;
    importance: FindingImportance;
    label: string;
    summary: string;
    sourceText: string | null;
    pageNumber: number | null;
    sectionId: string | null;
    sectionTitle?: string | null;
  } | null;
}

export interface CreateActionInput {
  documentId: string;
  findingId?: string | null;
  userId: string;
  title: string;
  description?: string | null;
}

export interface UpdateActionStatusInput {
  actionId: string;
  userId: string;
  status: ActionStatus;
}

export interface ListActionsInput {
  userId: string;
  documentId?: string;
  status?: ActionStatus | "all";
}

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CreateActionInputSchema = z.object({
  documentId: z.string().regex(UUID_REGEX, "Invalid document ID format"),
  findingId: z
    .string()
    .regex(UUID_REGEX, "Invalid finding ID format")
    .nullable()
    .optional(),
  userId: z.string().trim().min(1, "User ID is required"),
  title: z
    .string()
    .trim()
    .min(1, "Action title is required")
    .max(300, "Action title must not exceed 300 characters"),
  description: z
    .string()
    .trim()
    .max(2000, "Action description must not exceed 2000 characters")
    .nullable()
    .optional(),
});

export const UpdateActionStatusInputSchema = z.object({
  actionId: z.string().regex(UUID_REGEX, "Invalid action ID format"),
  userId: z.string().trim().min(1, "User ID is required"),
  status: z.enum(ACTION_STATUSES, {
    errorMap: () => ({ message: "Invalid action status. Must be 'open' or 'completed'." }),
  }),
});

// ---------------------------------------------------------------------------
// Verification Helpers
// ---------------------------------------------------------------------------

/**
 * Verifies document exists and belongs to the authenticated user.
 * Throws ActionAccessError if missing or unauthorized (anti-oracle).
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
      throw new ActionAccessError("Document not found or access denied");
    }

    return doc;
  } catch (error) {
    if (error instanceof ActionAccessError) throw error;
    throw new ActionServiceError("Failed to verify document ownership", {
      cause: error,
    });
  }
}

/**
 * Verifies finding exists and belongs to the specified document.
 * Throws ActionAccessError if missing or mismatched (anti-oracle).
 */
export async function verifyFindingBelongsToDocument(
  findingId: string,
  documentId: string
): Promise<{ id: string }> {
  try {
    const [finding] = await db
      .select({ id: documentFindings.id })
      .from(documentFindings)
      .where(
        and(
          eq(documentFindings.id, findingId),
          eq(documentFindings.documentId, documentId)
        )
      )
      .limit(1);

    if (!finding) {
      throw new ActionAccessError("Finding not found or access denied");
    }

    return finding;
  } catch (error) {
    if (error instanceof ActionAccessError) throw error;
    throw new ActionServiceError("Failed to verify finding provenance", {
      cause: error,
    });
  }
}

/**
 * Verifies action exists and belongs to the user.
 * Throws ActionAccessError if missing or unauthorized (anti-oracle).
 */
export async function verifyActionOwnership(
  actionId: string,
  userId: string
): Promise<Action> {
  try {
    const [action] = await db
      .select()
      .from(actions)
      .where(and(eq(actions.id, actionId), eq(actions.userId, userId)))
      .limit(1);

    if (!action) {
      throw new ActionAccessError("Action not found or access denied");
    }

    return action;
  } catch (error) {
    if (error instanceof ActionAccessError) throw error;
    throw new ActionServiceError("Failed to verify action ownership", {
      cause: error,
    });
  }
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Creates a trackable legal review action from a document finding or standalone document.
 */
export async function createAction(input: CreateActionInput): Promise<Action> {
  const parsed = CreateActionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ActionValidationError(parsed.error.errors[0]?.message ?? "Invalid action input");
  }

  const { documentId, findingId, userId, title, description } = parsed.data;

  // 1. Verify document ownership
  await verifyDocumentOwnership(documentId, userId);

  // 2. If findingId provided, verify it belongs to this document
  if (findingId) {
    await verifyFindingBelongsToDocument(findingId, documentId);
  }

  // 3. Insert action
  try {
    const [created] = await db
      .insert(actions)
      .values({
        id: crypto.randomUUID(),
        documentId,
        findingId: findingId ?? null,
        userId,
        title,
        description: description || null,
        status: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      })
      .returning();

    return created;
  } catch (error) {
    throw new ActionServiceError("Failed to persist action item", { cause: error });
  }
}

/**
 * Updates the status of an action (open <-> completed).
 * Sets completedAt when completed, and clears completedAt when reopened.
 */
export async function updateActionStatus(
  input: UpdateActionStatusInput
): Promise<Action> {
  const parsed = UpdateActionStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ActionValidationError(parsed.error.errors[0]?.message ?? "Invalid action update");
  }

  const { actionId, userId, status } = parsed.data;

  // Verify ownership
  await verifyActionOwnership(actionId, userId);

  try {
    const isCompleted = status === "completed";
    const now = new Date();

    const [updated] = await db
      .update(actions)
      .set({
        status,
        completedAt: isCompleted ? now : null,
        updatedAt: now,
      })
      .where(and(eq(actions.id, actionId), eq(actions.userId, userId)))
      .returning();

    return updated;
  } catch (error) {
    throw new ActionServiceError("Failed to update action status", { cause: error });
  }
}

/**
 * Lists all actions for a user with joined document and finding context.
 * Supports filtering by documentId and status ("open" | "completed" | "all").
 */
export async function listActionsByUser(
  input: ListActionsInput
): Promise<ActionWithDetails[]> {
  if (!input.userId || !input.userId.trim()) {
    throw new ActionValidationError("User ID is required");
  }

  const userId = input.userId.trim();

  // If filtering by documentId, verify ownership (anti-oracle)
  if (input.documentId) {
    if (!UUID_REGEX.test(input.documentId)) {
      throw new ActionValidationError("Invalid document ID format");
    }
    await verifyDocumentOwnership(input.documentId, userId);
  }

  try {
    const conditions = [eq(actions.userId, userId)];

    if (input.documentId) {
      conditions.push(eq(actions.documentId, input.documentId));
    }

    if (input.status && input.status !== "all") {
      conditions.push(eq(actions.status, input.status));
    }

    const rows = await db
      .select({
        action: actions,
        document: {
          id: documents.id,
          title: documents.title,
          originalFilename: documents.originalFilename,
        },
        finding: {
          id: documentFindings.id,
          findingType: documentFindings.findingType,
          importance: documentFindings.importance,
          label: documentFindings.label,
          summary: documentFindings.summary,
          sourceText: documentFindings.sourceText,
          pageNumber: documentFindings.pageNumber,
          sectionId: documentFindings.sectionId,
        },
        sectionTitle: documentSections.title,
      })
      .from(actions)
      .innerJoin(documents, eq(actions.documentId, documents.id))
      .leftJoin(documentFindings, eq(actions.findingId, documentFindings.id))
      .leftJoin(
        documentSections,
        eq(documentFindings.sectionId, documentSections.id)
      )
      .where(and(...conditions))
      .orderBy(desc(actions.createdAt), asc(actions.id));

    return rows.map((r) => ({
      ...r.action,
      document: r.document,
      finding:
        r.finding && r.finding.id
          ? {
              ...r.finding,
              sectionTitle: r.sectionTitle ?? null,
            }
          : null,
    }));
  } catch (error) {
    if (error instanceof ActionAccessError) throw error;
    throw new ActionServiceError("Failed to list actions", { cause: error });
  }
}

/**
 * Retrieves a single action with joined details, verifying ownership.
 */
export async function getActionById(
  actionId: string,
  userId: string
): Promise<ActionWithDetails> {
  if (!UUID_REGEX.test(actionId)) {
    throw new ActionValidationError("Invalid action ID format");
  }

  await verifyActionOwnership(actionId, userId);

  try {
    const [row] = await db
      .select({
        action: actions,
        document: {
          id: documents.id,
          title: documents.title,
          originalFilename: documents.originalFilename,
        },
        finding: {
          id: documentFindings.id,
          findingType: documentFindings.findingType,
          importance: documentFindings.importance,
          label: documentFindings.label,
          summary: documentFindings.summary,
          sourceText: documentFindings.sourceText,
          pageNumber: documentFindings.pageNumber,
          sectionId: documentFindings.sectionId,
        },
        sectionTitle: documentSections.title,
      })
      .from(actions)
      .innerJoin(documents, eq(actions.documentId, documents.id))
      .leftJoin(documentFindings, eq(actions.findingId, documentFindings.id))
      .leftJoin(
        documentSections,
        eq(documentFindings.sectionId, documentSections.id)
      )
      .where(and(eq(actions.id, actionId), eq(actions.userId, userId)))
      .limit(1);

    if (!row) {
      throw new ActionAccessError("Action not found or access denied");
    }

    return {
      ...row.action,
      document: row.document,
      finding:
        row.finding && row.finding.id
          ? {
              ...row.finding,
              sectionTitle: row.sectionTitle ?? null,
            }
          : null,
    };
  } catch (error) {
    if (error instanceof ActionAccessError) throw error;
    throw new ActionServiceError("Failed to get action", { cause: error });
  }
}

/**
 * Deletes an action item, verifying ownership.
 */
export async function deleteAction(
  actionId: string,
  userId: string
): Promise<void> {
  if (!UUID_REGEX.test(actionId)) {
    throw new ActionValidationError("Invalid action ID format");
  }

  await verifyActionOwnership(actionId, userId);

  try {
    await db
      .delete(actions)
      .where(and(eq(actions.id, actionId), eq(actions.userId, userId)));
  } catch (error) {
    throw new ActionServiceError("Failed to delete action", { cause: error });
  }
}

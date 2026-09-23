/**
 * Actions Collection Route Handler — ClauseWise (Phase 7)
 *
 * GET  /api/actions — List actions for the authenticated user (with optional documentId & status filters)
 * POST /api/actions — Create a new review action from a document finding or standalone document
 *
 * Security & Anti-Oracle Invariants:
 * 1. Session authentication required (401).
 * 2. Document and finding ownership strictly enforced.
 * 3. Inaccessible or foreign IDs return uniform 404.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  createAction,
  listActionsByUser,
  ActionAccessError,
  ActionValidationError,
} from "@/lib/services/action-service";
import type { ActionStatus } from "@/lib/db/schema";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateActionBodySchema = z.object({
  documentId: z.string().regex(UUID_REGEX, "Invalid document ID format"),
  findingId: z
    .string()
    .regex(UUID_REGEX, "Invalid finding ID format")
    .nullable()
    .optional(),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(300, "Title must not exceed 300 characters"),
  description: z
    .string()
    .trim()
    .max(2000, "Description must not exceed 2000 characters")
    .nullable()
    .optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId") || undefined;
  const statusParam = searchParams.get("status") || undefined;

  let status: ActionStatus | "all" | undefined;
  if (statusParam === "open" || statusParam === "completed" || statusParam === "all") {
    status = statusParam;
  } else if (statusParam) {
    return NextResponse.json(
      { error: "Invalid status query parameter. Must be 'open', 'completed', or 'all'." },
      { status: 400 }
    );
  }

  if (documentId && !UUID_REGEX.test(documentId)) {
    return NextResponse.json(
      { error: "Document not found or access denied" },
      { status: 404 }
    );
  }

  try {
    const actions = await listActionsByUser({
      userId: session.user.id,
      documentId,
      status,
    });

    return NextResponse.json({ actions }, { status: 200 });
  } catch (error) {
    if (error instanceof ActionAccessError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ActionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[GET /api/actions] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve actions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateActionBodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  try {
    const action = await createAction({
      ...parsed.data,
      userId: session.user.id,
    });

    return NextResponse.json({ action }, { status: 201 });
  } catch (error) {
    if (error instanceof ActionAccessError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ActionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[POST /api/actions] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to create action" },
      { status: 500 }
    );
  }
}

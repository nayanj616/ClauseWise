/**
 * Single Action Item Route Handler — ClauseWise (Phase 7)
 *
 * GET    /api/actions/[actionId] — Retrieve single action with joined details
 * PATCH  /api/actions/[actionId] — Update action status (open <-> completed)
 * DELETE /api/actions/[actionId] — Delete action item
 *
 * Security & Anti-Oracle Invariants:
 * 1. Session authentication required (401).
 * 2. Ownership verification against session.user.id.
 * 3. Uniform 404 on missing, mismatched, or unauthorized action ID.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  getActionById,
  updateActionStatus,
  deleteAction,
  ActionAccessError,
  ActionValidationError,
} from "@/lib/services/action-service";
import { ACTION_STATUSES } from "@/lib/db/schema";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UpdateActionStatusSchema = z.object({
  status: z.enum(ACTION_STATUSES, {
    errorMap: () => ({ message: "Status must be 'open' or 'completed'" }),
  }),
});

interface RouteParams {
  params: Promise<{ actionId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteParams
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { actionId } = await context.params;
  if (!actionId || !UUID_REGEX.test(actionId)) {
    return NextResponse.json(
      { error: "Action not found or access denied" },
      { status: 404 }
    );
  }

  try {
    const action = await getActionById(actionId, session.user.id);
    return NextResponse.json({ action }, { status: 200 });
  } catch (error) {
    if (error instanceof ActionAccessError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ActionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(`[GET /api/actions/${actionId}] Unexpected error:`, error);
    return NextResponse.json(
      { error: "Failed to retrieve action" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteParams
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { actionId } = await context.params;
  if (!actionId || !UUID_REGEX.test(actionId)) {
    return NextResponse.json(
      { error: "Action not found or access denied" },
      { status: 404 }
    );
  }

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateActionStatusSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid update payload" },
      { status: 400 }
    );
  }

  try {
    const action = await updateActionStatus({
      actionId,
      userId: session.user.id,
      status: parsed.data.status,
    });

    return NextResponse.json({ action }, { status: 200 });
  } catch (error) {
    if (error instanceof ActionAccessError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ActionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(`[PATCH /api/actions/${actionId}] Unexpected error:`, error);
    return NextResponse.json(
      { error: "Failed to update action status" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteParams
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { actionId } = await context.params;
  if (!actionId || !UUID_REGEX.test(actionId)) {
    return NextResponse.json(
      { error: "Action not found or access denied" },
      { status: 404 }
    );
  }

  try {
    await deleteAction(actionId, session.user.id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ActionAccessError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ActionValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(`[DELETE /api/actions/${actionId}] Unexpected error:`, error);
    return NextResponse.json(
      { error: "Failed to delete action" },
      { status: 500 }
    );
  }
}

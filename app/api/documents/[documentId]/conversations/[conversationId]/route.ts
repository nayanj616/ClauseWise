/**
 * Individual Conversation Route Handler — ClauseWise (Phase 5 Slice 5.4)
 *
 * GET    /api/documents/[documentId]/conversations/[conversationId] — Get conversation & messages
 * DELETE /api/documents/[documentId]/conversations/[conversationId] — Delete conversation
 *
 * Security & Anti-Oracle Invariants:
 * 1. Session authentication required (401).
 * 2. Ownership verified across both documentId and conversationId against session.user.id.
 * 3. Inaccessible, cross-tenant, or non-existent requests return uniform 404 "Conversation not found or access denied".
 * 4. Deterministic message ordering: ORDER BY createdAt ASC, id ASC.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getConversationWithMessages,
  deleteConversation,
  ConversationAccessError,
} from "@/lib/services/conversation-service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ documentId: string; conversationId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteParams
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId, conversationId } = await context.params;

  if (
    !documentId ||
    !conversationId ||
    !UUID_REGEX.test(documentId.trim()) ||
    !UUID_REGEX.test(conversationId.trim())
  ) {
    return NextResponse.json(
      { error: "Conversation not found or access denied" },
      { status: 404 }
    );
  }

  try {
    const data = await getConversationWithMessages({
      conversationId: conversationId.trim(),
      documentId: documentId.trim(),
      userId: session.user.id,
    });

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    if (error instanceof ConversationAccessError) {
      return NextResponse.json(
        { error: "Conversation not found or access denied" },
        { status: 404 }
      );
    }

    console.error(
      `[GET /api/documents/${documentId}/conversations/${conversationId}] Unexpected error:`,
      error
    );
    return NextResponse.json(
      { error: "Failed to retrieve conversation" },
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

  const { documentId, conversationId } = await context.params;

  if (
    !documentId ||
    !conversationId ||
    !UUID_REGEX.test(documentId.trim()) ||
    !UUID_REGEX.test(conversationId.trim())
  ) {
    return NextResponse.json(
      { error: "Conversation not found or access denied" },
      { status: 404 }
    );
  }

  try {
    await deleteConversation({
      conversationId: conversationId.trim(),
      documentId: documentId.trim(),
      userId: session.user.id,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ConversationAccessError) {
      return NextResponse.json(
        { error: "Conversation not found or access denied" },
        { status: 404 }
      );
    }

    console.error(
      `[DELETE /api/documents/${documentId}/conversations/${conversationId}] Unexpected error:`,
      error
    );
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}


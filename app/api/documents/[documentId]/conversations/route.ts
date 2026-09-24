/**
 * Conversations Collection Route Handler — ClauseWise (Phase 5 Slice 5.4)
 *
 * GET  /api/documents/[documentId]/conversations — List conversations for document
 * POST /api/documents/[documentId]/conversations — Create a new conversation thread
 *
 * Security & Anti-Oracle Invariants:
 * 1. Session authentication required (401).
 * 2. Document ownership verified against session.user.id.
 * 3. Inaccessible or invalid document IDs return uniform 404 "Document not found or access denied".
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  getConversationsForDocument,
  createConversation,
  ConversationAccessError,
  ConversationValidationError,
} from "@/lib/services/conversation-service";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateConversationBodySchema = z.object({
  title: z.string().trim().max(200, "Title must not exceed 200 characters").optional(),
});

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteParams
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;
  if (!documentId || !UUID_REGEX.test(documentId.trim())) {
    return NextResponse.json(
      { error: "Document not found or access denied" },
      { status: 404 }
    );
  }

  try {
    const convos = await getConversationsForDocument({
      documentId: documentId.trim(),
      userId: session.user.id,
    });

    return NextResponse.json({ conversations: convos }, { status: 200 });
  } catch (error) {
    if (error instanceof ConversationAccessError) {
      return NextResponse.json(
        { error: "Document not found or access denied" },
        { status: 404 }
      );
    }

    console.error(
      `[GET /api/documents/${documentId}/conversations] Unexpected error:`,
      error
    );
    return NextResponse.json(
      { error: "Failed to retrieve conversations" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: RouteParams
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;
  if (!documentId || !UUID_REGEX.test(documentId.trim())) {
    return NextResponse.json(
      { error: "Document not found or access denied" },
      { status: 404 }
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const parseResult = CreateConversationBodySchema.safeParse(body);
  if (!parseResult.success) {
    const msg = parseResult.error.issues[0]?.message || "Invalid input";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const convo = await createConversation({
      documentId: documentId.trim(),
      userId: session.user.id,
      title: parseResult.data.title,
    });

    return NextResponse.json({ conversation: convo }, { status: 201 });
  } catch (error) {
    if (error instanceof ConversationAccessError) {
      return NextResponse.json(
        { error: "Document not found or access denied" },
        { status: 404 }
      );
    }

    if (error instanceof ConversationValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error(
      `[POST /api/documents/${documentId}/conversations] Unexpected error:`,
      error
    );
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}


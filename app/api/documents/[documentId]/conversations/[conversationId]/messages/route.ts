/**
 * Conversation Messages Streaming Route Handler — ClauseWise (Phase 5 Slice 5.4)
 *
 * POST /api/documents/[documentId]/conversations/[conversationId]/messages
 *
 * Accepts JSON: { "question": string }
 * Responds with Server-Sent Events (SSE: text/event-stream).
 *
 * Invariants & Execution Pipeline:
 * 1. Session authentication required (401).
 * 2. Strict ownership verified for BOTH documentId and conversationId against session.user.id.
 * 3. Anti-oracle protection: Nonexistent or unauthorized IDs return uniform 404.
 * 4. User question persisted immediately to DB (role: "user", null citations/flags).
 * 5. Bounded conversational context (up to 3 prior turns) loaded without duplicating current question.
 * 6. Deterministic evidence retrieval strictly for current question.
 * 7. Evidence sufficiency gate: If insufficient, persists refusal and completes with ZERO LLM calls.
 * 8. Streams provisional answer text deltas (event: delta).
 * 9. Server accumulates complete structured output, validates citations, persists completed assistant message,
 *    and emits terminal authoritative event (event: complete).
 * 10. Interrupted streams never persist a partial assistant answer.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  verifyConversationOwnership,
  appendUserMessage,
  getConversationWithMessages,
  ConversationAccessError,
} from "@/lib/services/conversation-service";
import { answerConversationQuestionStream } from "@/lib/services/qa-service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MessageBodySchema = z.object({
  question: z
    .string({ required_error: "Question is required" })
    .trim()
    .min(1, "Question must not be empty")
    .max(2000, "Question must not exceed 2000 characters"),
});

interface RouteParams {
  params: Promise<{ documentId: string; conversationId: string }>;
}

export async function POST(
  request: Request,
  context: RouteParams
): Promise<Response> {
  // 1. Session authentication check
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { documentId, conversationId } = await context.params;

  // 2. Validate route parameter formats
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

  const cleanDocId = documentId.trim();
  const cleanConvoId = conversationId.trim();

  // 3. Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const parseResult = MessageBodySchema.safeParse(body);
  if (!parseResult.success) {
    const errorMsg =
      parseResult.error.issues[0]?.message || "Invalid question input";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }

  const question = parseResult.data.question;

  // 4. Verify conversation ownership at domain boundary
  try {
    await verifyConversationOwnership(cleanConvoId, cleanDocId, userId);
  } catch (error) {
    if (error instanceof ConversationAccessError) {
      return NextResponse.json(
        { error: "Conversation not found or access denied" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Failed to verify conversation access" },
      { status: 500 }
    );
  }

  // 5. Persist user message to database
  try {
    await appendUserMessage({
      conversationId: cleanConvoId,
      documentId: cleanDocId,
      userId,
      content: question,
    });
  } catch (error) {
    console.error(
      `[POST messages] Failed to persist user message for convo ${cleanConvoId}:`,
      error
    );
    return NextResponse.json(
      { error: "Failed to save message" },
      { status: 500 }
    );
  }

  // 6. Retrieve prior conversation turns (strictly prior to current turn, max 6 messages / 3 turns)
  let priorTurns: Array<{ role: "user" | "assistant"; content: string }> = [];
  try {
    const { messages } = await getConversationWithMessages({
      conversationId: cleanConvoId,
      documentId: cleanDocId,
      userId,
    });

    // Exclude the user message just inserted at the end
    const priorHistory = messages.slice(0, -1);
    priorTurns = priorHistory.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));
  } catch (error) {
    console.warn(
      `[POST messages] Could not load prior turns for convo ${cleanConvoId}:`,
      error
    );
  }

  // 7. Open Server-Sent Events stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(eventType: string, data: unknown) {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream controller may be closed if client disconnected
        }
      }

      try {
        const streamGenerator = answerConversationQuestionStream({
          documentId: cleanDocId,
          userId,
          conversationId: cleanConvoId,
          question,
          priorTurns,
          signal: request.signal,
        });

        for await (const event of streamGenerator) {
          if (request.signal.aborted) {
            break;
          }
          sendEvent(event.type, event);
        }
      } catch (streamError) {
        if (!request.signal.aborted) {
          sendEvent("error", {
            error: "An unexpected error occurred while generating the answer.",
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Ignore if already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}


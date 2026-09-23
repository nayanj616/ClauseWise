/**
 * Document Q&A Route Handler — ClauseWise (Phase 5 Slice 5.3)
 *
 * POST /api/documents/[documentId]/ask
 *
 * Accepts a JSON body: { "question": string }
 *
 * Security & Invariants:
 * 1. Session authentication required (401).
 * 2. Document ownership enforced against session.user.id.
 * 3. Anti-oracle protection: Inaccessible, nonexistent, or invalid document IDs
 *    return uniform 404 "Document not found or access denied".
 * 4. Input validation: Question must be non-empty string <= 2000 chars (400).
 * 5. Domain service delegation: Calls answerQuestion() from Phase 5.2.
 * 6. Error sanitization: Internal and provider errors are logged server-side
 *    and masked with clean user-safe messages (500).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  answerQuestion,
  QaValidationError,
} from "@/lib/services/qa-service";
import { DocumentAccessError } from "@/lib/services/retrieval-service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AskBodySchema = z.object({
  question: z
    .string({ required_error: "Question is required" })
    .trim()
    .min(1, "Question must not be empty")
    .max(2000, "Question must not exceed 2000 characters"),
});

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

export async function POST(
  request: Request,
  context: RouteParams
): Promise<NextResponse> {
  // 1. Authentication check
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // 2. Validate route parameter format
  const { documentId } = await context.params;

  if (!documentId || !UUID_REGEX.test(documentId.trim())) {
    return NextResponse.json(
      { error: "Document not found or access denied" },
      { status: 404 }
    );
  }

  // 3. Parse JSON request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body" },
      { status: 400 }
    );
  }

  const parseResult = AskBodySchema.safeParse(body);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0]?.message || "Invalid question input";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  // 4. Delegate to domain QA service
  try {
    const result = await answerQuestion({
      documentId: documentId.trim(),
      userId,
      question: parseResult.data.question,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DocumentAccessError) {
      return NextResponse.json(
        { error: "Document not found or access denied" },
        { status: 404 }
      );
    }

    if (error instanceof QaValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error(
      `[POST /api/documents/${documentId}/ask] Error answering question:`,
      error
    );

    return NextResponse.json(
      { error: "Failed to answer question. Please try again later." },
      { status: 500 }
    );
  }
}


/**
 * Professional Prep Route Handler — ClauseWise (Phase 8)
 *
 * GET /api/documents/[documentId]/prep
 *
 * Retrieves the complete evidence-backed professional preparation briefing
 * for an authorized document.
 *
 * Security & Anti-Oracle Invariants:
 * 1. Session authentication strictly enforced (401 Unauthorized).
 * 2. Document ownership verified against session.user.id.
 * 3. Inaccessible, cross-tenant, or malformed document IDs return uniform 404
 *    "Document not found or access denied" (prevents document existence leakage).
 * 4. Database errors are sanitized; sensitive stack traces are never exposed.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getProfessionalPrepData,
  PrepAccessError,
  PrepValidationError,
} from "@/lib/services/preparation-service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteParams
): Promise<NextResponse> {
  // 1. Session authentication
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;

  // 2. Validate documentId UUID format
  if (!documentId || !UUID_REGEX.test(documentId.trim())) {
    return NextResponse.json(
      { error: "Document not found or access denied" },
      { status: 404 }
    );
  }

  try {
    // 3. Delegate to domain service (single source of truth)
    const prepData = await getProfessionalPrepData(
      documentId.trim(),
      session.user.id
    );

    return NextResponse.json({ prep: prepData }, { status: 200 });
  } catch (error) {
    if (error instanceof PrepAccessError) {
      return NextResponse.json(
        { error: "Document not found or access denied" },
        { status: 404 }
      );
    }

    if (error instanceof PrepValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error(
      `[GET /api/documents/${documentId}/prep] Unexpected error:`,
      error
    );
    return NextResponse.json(
      { error: "Failed to assemble professional prep data" },
      { status: 500 }
    );
  }
}


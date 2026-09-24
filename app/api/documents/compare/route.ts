/**
 * Document Comparison API Route Handler — ClauseWise (Phase 9)
 *
 * GET /api/documents/compare?docA=[uuid]&docB=[uuid]
 *
 * Performs on-demand, deterministic side-by-side comparison between two
 * documents owned by the authenticated session user.
 *
 * Security & Anti-Oracle Invariants:
 * 1. Session authentication strictly enforced (401 Unauthorized).
 * 2. Ownership verified for both Document A and Document B.
 * 3. Inaccessible, cross-tenant, or non-existent document IDs return uniform
 *    404 "Document not found or access denied" (prevents existence leakage).
 * 4. Self-comparison (docA === docB) rejected with 400 Bad Request.
 * 5. Readiness verified: documents not in "ready" state return 422 Unprocessable Entity.
 * 6. Internal database errors are sanitized; credentials and stack traces are never exposed.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  compareDocuments,
  ComparisonAccessError,
  ComparisonValidationError,
  ComparisonReadinessError,
} from "@/lib/services/comparison-service";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<NextResponse> {
  // 1. Session authentication
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse query parameters
  const { searchParams } = new URL(request.url);
  const docA = searchParams.get("docA");
  const docB = searchParams.get("docB");

  if (!docA || !docB) {
    return NextResponse.json(
      { error: "Both docA and docB query parameters are required" },
      { status: 400 }
    );
  }

  // 3. UUID format validation
  if (!UUID_REGEX.test(docA) || !UUID_REGEX.test(docB)) {
    return NextResponse.json(
      { error: "Invalid document ID format. Valid UUIDs are required." },
      { status: 400 }
    );
  }

  // 4. Self-comparison rejection guard
  if (docA.toLowerCase() === docB.toLowerCase()) {
    return NextResponse.json(
      { error: "Cannot compare a document with itself. Please select two distinct documents." },
      { status: 400 }
    );
  }

  // 5. Execute comparison domain service
  try {
    const comparisonResult = await compareDocuments({
      documentAId: docA,
      documentBId: docB,
      userId: session.user.id,
    });

    return NextResponse.json(comparisonResult, { status: 200 });
  } catch (error) {
    if (error instanceof ComparisonAccessError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof ComparisonValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ComparisonReadinessError) {
      return NextResponse.json(
        { error: error.message, documentId: error.documentId, status: error.status },
        { status: 422 }
      );
    }

    console.error("[GET /api/documents/compare] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to compare documents due to an unexpected error" },
      { status: 500 }
    );
  }
}


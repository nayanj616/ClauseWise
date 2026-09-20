/**
 * Document Upload Route Handler — ClauseWise
 *
 * POST /api/documents/upload
 *
 * Accepts a multipart/form-data request containing a 'file' field.
 * Enforces session authentication and ownership:
 * - Rejects unauthenticated requests with 401
 * - Uses session.user.id exclusively for ownership (ignores client input)
 * - Returns 201 with the created Document record on success
 * - Returns 400 with user-friendly message on validation failure
 * - Returns 500 with generic message on storage or database failure
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadDocument } from "@/lib/services/document-service";
import { DocumentValidationError } from "@/lib/validation/document-validation";

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Authentication check
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // 2. Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data request" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No document file provided. Include a 'file' field in form data." },
      { status: 400 }
    );
  }

  // 3. Delegate to domain service
  try {
    const document = await uploadDocument({
      userId, // Strictly from verified session.user.id
      file,
      processExtraction: true,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[POST /api/documents/upload] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to upload and process document" },
      { status: 500 }
    );
  }
}


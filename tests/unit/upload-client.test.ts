/**
 * Unit Tests — Upload Client & Client-Side Validation
 *
 * Covers:
 * 1. PDF can be selected and submitted
 * 2. DOCX can be selected and submitted
 * 3. Oversized files are rejected before upload (client-side validation)
 * 4. Unsupported file types are rejected before upload (client-side validation)
 * 5. Successful 201 response produces expected success result and preserves document
 * 6. 400 response produces user-safe validation message
 * 7. 401 response produces authentication-related message
 * 8. 500 response produces generic failure message
 * 9. Network/request failure returns retryable error state
 * 10. Empty files rejected before upload
 * 11. No client-supplied user ID is sent in the request payload
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateClientUploadFile,
  uploadDocumentFileApi,
  CLIENT_MAX_FILE_SIZE_BYTES,
} from "@/lib/upload/upload-client";
import type { Document } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockClientFile(
  name: string,
  type: string,
  size: number
): File {
  const buffer = new Uint8Array(size);
  const blob = new Blob([buffer], { type });
  return new File([blob], name, { type });
}

// ---------------------------------------------------------------------------
// Client Validation Tests
// ---------------------------------------------------------------------------

describe("validateClientUploadFile", () => {
  it("accepts a valid PDF file under 10 MB", () => {
    const file = createMockClientFile("contract.pdf", "application/pdf", 1024);
    const result = validateClientUploadFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts a valid DOCX file under 10 MB", () => {
    const file = createMockClientFile(
      "contract.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      2048
    );
    const result = validateClientUploadFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts files with uppercase extensions (.PDF, .DOCX)", () => {
    const pdf = createMockClientFile("agreement.PDF", "application/pdf", 1024);
    expect(validateClientUploadFile(pdf).valid).toBe(true);

    const docx = createMockClientFile("agreement.DOCX", "application/octet-stream", 1024);
    expect(validateClientUploadFile(docx).valid).toBe(true);
  });

  it("rejects null or undefined file", () => {
    expect(validateClientUploadFile(null).valid).toBe(false);
    expect(validateClientUploadFile(null).error).toContain("Please select a document");

    expect(validateClientUploadFile(undefined).valid).toBe(false);
  });

  it("rejects empty files (0 bytes) before upload", () => {
    const file = createMockClientFile("empty.pdf", "application/pdf", 0);
    const result = validateClientUploadFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("empty (0 bytes)");
  });

  it("rejects files larger than 10 MB before upload", () => {
    const file = createMockClientFile(
      "huge.pdf",
      "application/pdf",
      CLIENT_MAX_FILE_SIZE_BYTES + 1
    );
    const result = validateClientUploadFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds the 10 MB limit");
  });

  it("rejects unsupported file extensions before upload", () => {
    const exe = createMockClientFile("malware.exe", "application/x-msdownload", 1024);
    expect(validateClientUploadFile(exe).valid).toBe(false);
    expect(validateClientUploadFile(exe).error).toContain("Only PDF (.pdf) and Word (.docx)");

    const txt = createMockClientFile("notes.txt", "text/plain", 1024);
    expect(validateClientUploadFile(txt).valid).toBe(false);

    const zip = createMockClientFile("archive.zip", "application/zip", 1024);
    expect(validateClientUploadFile(zip).valid).toBe(false);

    const png = createMockClientFile("image.png", "image/png", 1024);
    expect(validateClientUploadFile(png).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// API Integration Tests (uploadDocumentFileApi)
// ---------------------------------------------------------------------------

describe("uploadDocumentFileApi", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("submits a PDF file as multipart/form-data to POST /api/documents/upload", async () => {
    const file = createMockClientFile("terms.pdf", "application/pdf", 1024);
    const now = new Date().toISOString();
    const mockCreatedDoc = {
      id: "doc-123",
      userId: "user-456",
      title: "terms.pdf",
      originalFilename: "terms.pdf",
      storagePath: "user-456/doc-123/terms.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      status: "queued" as const,
      errorMessage: null,
      governingLaw: null,
      jurisdiction: null,
      createdAt: now,
      updatedAt: now,
    };

    let calledUrl = "";
    let calledInit: RequestInit | undefined;

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calledUrl = url.toString();
      calledInit = init;
      return new Response(JSON.stringify({ document: mockCreatedDoc }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await uploadDocumentFileApi(file);

    expect(calledUrl).toBe("/api/documents/upload");
    expect(calledInit?.method).toBe("POST");

    // Verify payload is FormData with file attached
    const body = calledInit?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file")).toBe(file);
    // Crucial security check: no client-controlled user/owner ID is sent
    expect(body.get("userId")).toBeNull();
    expect(body.get("user_id")).toBeNull();
    expect(body.get("ownerId")).toBeNull();

    // Verify result
    expect(result.success).toBe(true);
    expect(result.document).toEqual(mockCreatedDoc);
    expect(result.document?.id).toBe("doc-123");
  });

  it("submits a DOCX file and returns success state", async () => {
    const file = createMockClientFile(
      "agreement.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      2048
    );
    const now = new Date().toISOString();
    const mockCreatedDoc = {
      id: "doc-docx-789",
      userId: "user-456",
      title: "agreement.docx",
      originalFilename: "agreement.docx",
      storagePath: "user-456/doc-docx-789/agreement.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileSizeBytes: 2048,
      status: "queued" as const,
      errorMessage: null,
      governingLaw: null,
      jurisdiction: null,
      createdAt: now,
      updatedAt: now,
    };

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ document: mockCreatedDoc }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await uploadDocumentFileApi(file);
    expect(result.success).toBe(true);
    expect(result.document?.id).toBe("doc-docx-789");
  });

  it("does not send request if client-side validation fails (e.g. unsupported type)", async () => {
    const file = createMockClientFile("bad.sh", "application/x-sh", 100);
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const result = await uploadDocumentFileApi(file);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only PDF (.pdf) and Word (.docx)");
  });

  it("handles 400 response and returns user-safe validation error message", async () => {
    const file = createMockClientFile("corrupt.pdf", "application/pdf", 512);

    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: "Invalid or malformed PDF file signature" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    const result = await uploadDocumentFileApi(file);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid or malformed PDF file signature");
    expect(result.document).toBeUndefined();
  });

  it("handles 401 response and returns authentication-required message", async () => {
    const file = createMockClientFile("lease.pdf", "application/pdf", 1024);

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });

    const result = await uploadDocumentFileApi(file);
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Authentication required. Please sign in and try again."
    );
  });

  it("handles 500 response and returns generic failure message without leaking details", async () => {
    const file = createMockClientFile("lease.pdf", "application/pdf", 1024);

    global.fetch = vi.fn(async () => {
      // Even if server sent detailed error or stack, client should give generic safe message
      return new Response(
        JSON.stringify({
          error: "Database constraint error: foreign key violated",
          detail: "pg_catalog.pg_constraint...",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    });

    const result = await uploadDocumentFileApi(file);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to upload document. Please try again later.");
    // Verify no server details leaked
    expect(result.error).not.toContain("Database");
    expect(result.error).not.toContain("foreign key");
  });

  it("handles network error and returns retryable network error message", async () => {
    const file = createMockClientFile("lease.pdf", "application/pdf", 1024);

    global.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const result = await uploadDocumentFileApi(file);
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Network error. Please check your connection and try again."
    );
  });
});

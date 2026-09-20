/**
 * Unit Tests — POST /api/documents/upload Route Handler
 *
 * Tests:
 * - Unauthenticated request rejected with 401
 * - Ownership strictly resolved from session (client-supplied owner ID ignored)
 * - Missing file returns 400
 * - Validation error returns 400
 * - Successful upload returns 201 with document payload
 * - Unexpected failure returns 500
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: () => mockAuth(),
}));

const mockUploadDocument = vi.fn();
vi.mock("@/lib/services/document-service", () => ({
  uploadDocument: (...args: unknown[]) => mockUploadDocument(...args),
}));

import { POST } from "@/app/api/documents/upload/route";
import { DocumentValidationError } from "@/lib/validation/document-validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_USER_ID = "99999999-9999-4999-a999-999999999999";

function createMockPdfFile(name = "test.pdf") {
  const content = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF";
  const blob = new Blob([content], { type: "application/pdf" });
  return new File([blob], name, { type: "application/pdf" });
}

function createUploadRequest(
  file?: File | null,
  extraFields?: Record<string, string>
): Request {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      formData.append(key, value);
    }
  }

  // Create a request with FormData
  return new Request("http://localhost:3000/api/documents/upload", {
    method: "POST",
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/documents/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 Unauthorized when session does not exist", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const file = createMockPdfFile();
    const req = createUploadRequest(file);
    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  it("returns 401 Unauthorized when session exists but has no user ID", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { email: "test@example.com" }, // missing user.id
    });

    const file = createMockPdfFile();
    const req = createUploadRequest(file);
    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  it("returns 400 Bad Request when no file is provided in FormData", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: SESSION_USER_ID, email: "user@example.com" },
    });

    const req = createUploadRequest(null);
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("No document file provided");
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  it("assigns ownership strictly from authenticated session and ignores client-supplied userId", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: SESSION_USER_ID, email: "user@example.com" },
    });

    const file = createMockPdfFile("contract.pdf");
    const mockCreatedDoc = {
      id: "doc-uuid-1",
      userId: SESSION_USER_ID,
      title: "contract.pdf",
      originalFilename: "contract.pdf",
      storagePath: `${SESSION_USER_ID}/doc-uuid-1/contract.pdf`,
      mimeType: "application/pdf",
      fileSizeBytes: file.size,
      status: "queued",
    };
    mockUploadDocument.mockResolvedValueOnce(mockCreatedDoc);

    // Attacker sends someone else's ID in form data
    const req = createUploadRequest(file, {
      userId: "attacker-chosen-user-id",
      ownerId: "another-fake-id",
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.document.userId).toBe(SESSION_USER_ID);

    // Verify uploadDocument was called strictly with SESSION_USER_ID
    expect(mockUploadDocument).toHaveBeenCalledTimes(1);
    const callArg = mockUploadDocument.mock.calls[0][0] as {
      userId: string;
      file: File;
    };
    expect(callArg.userId).toBe(SESSION_USER_ID);
    expect(callArg.file.name).toBe("contract.pdf");
    expect(callArg.file.type).toBe("application/pdf");
  });

  it("returns 400 Bad Request when validation fails in domain service", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: SESSION_USER_ID, email: "user@example.com" },
    });

    mockUploadDocument.mockRejectedValueOnce(
      new DocumentValidationError("Invalid or malformed PDF file")
    );

    const file = createMockPdfFile();
    const req = createUploadRequest(file);
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid or malformed PDF file");
  });

  it("returns 500 Internal Server Error on unexpected service errors", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: SESSION_USER_ID, email: "user@example.com" },
    });

    mockUploadDocument.mockRejectedValueOnce(
      new Error("Database connection lost")
    );

    const file = createMockPdfFile();
    const req = createUploadRequest(file);
    const res = await POST(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to upload and process document");
  });
});

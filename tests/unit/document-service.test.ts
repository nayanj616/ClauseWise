/**
 * Unit Tests — Document Service
 *
 * Tests:
 * - Successful document upload (storage upload + DB record creation)
 * - Ownership assignment strictly from authenticated session
 * - Rollback / cleanup of storage object when DB insert fails
 * - Pre-storage rejection on validation errors (no storage / DB calls)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUploadDocumentFile = vi.fn();
const mockDeleteDocumentFile = vi.fn();

vi.mock("@/lib/storage/storage-client", () => ({
  DOCUMENTS_BUCKET: "documents",
  storageClient: { storage: { from: vi.fn() } },
  getDocumentsBucket: vi.fn(),
  uploadDocumentFile: (...args: unknown[]) => mockUploadDocumentFile(...args),
  deleteDocumentFile: (...args: unknown[]) => mockDeleteDocumentFile(...args),
  createSignedDocumentUrl: vi.fn(),
  StorageError: class StorageError extends Error {},
}));

const mockReturning = vi.fn();
const mockValues = vi.fn((..._args: unknown[]) => ({ returning: mockReturning }));
const mockInsert = vi.fn((..._args: unknown[]) => ({ values: mockValues }));

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

const mockProcessDocumentExtraction = vi.fn();
vi.mock("@/lib/services/extraction-persistence-service", () => ({
  processDocumentExtraction: (...args: unknown[]) => mockProcessDocumentExtraction(...args),
  persistDocumentExtraction: vi.fn(),
  DocumentNotFoundError: class DocumentNotFoundError extends Error {},
  ExtractionPersistenceError: class ExtractionPersistenceError extends Error {},
}));

const mockProcessDocumentIntelligence = vi.fn();
vi.mock("@/lib/services/intelligence-persistence-service", () => ({
  processDocumentIntelligence: (...args: unknown[]) =>
    mockProcessDocumentIntelligence(...args),
  persistDocumentIntelligence: vi.fn(),
  IntelligencePersistenceError: class IntelligencePersistenceError extends Error {},
}));

import { uploadDocument, DatabaseError } from "@/lib/services/document-service";
import { DocumentValidationError } from "@/lib/validation/document-validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

function createValidPdfFile(name = "test.pdf") {
  const buffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
  );
  return {
    name,
    type: "application/pdf",
    size: buffer.length,
    arrayBuffer: async () =>
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("uploadDocument service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadDocumentFile.mockResolvedValue(undefined);
    mockDeleteDocumentFile.mockResolvedValue(undefined);
  });

  it("uploads file to private storage and creates DB record with authenticated user ID", async () => {
    const file = createValidPdfFile("sample.pdf");
    const mockCreatedDoc = {
      id: "doc-uuid-1234",
      userId: TEST_USER_ID,
      title: "sample.pdf",
      originalFilename: "sample.pdf",
      storagePath: `${TEST_USER_ID}/doc-uuid-1234/sample.pdf`,
      mimeType: "application/pdf",
      fileSizeBytes: file.size,
      status: "queued",
      errorMessage: null,
      governingLaw: null,
      jurisdiction: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockReturning.mockResolvedValueOnce([mockCreatedDoc]);

    const result = await uploadDocument({
      userId: TEST_USER_ID,
      file,
    });

    // 1. Storage upload was called with server-controlled path
    expect(mockUploadDocumentFile).toHaveBeenCalledTimes(1);
    const [calledPath, calledBuffer, calledMime] =
      mockUploadDocumentFile.mock.calls[0];
    expect(calledPath).toContain(TEST_USER_ID);
    expect(calledPath.endsWith("sample.pdf")).toBe(true);
    expect(calledMime).toBe("application/pdf");
    expect(Buffer.isBuffer(calledBuffer)).toBe(true);

    // 2. Database insert was called with the authenticated userId
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER_ID,
        title: "sample.pdf",
        mimeType: "application/pdf",
        status: "queued",
      })
    );

    // 3. Returns the created document
    expect(result).toEqual(mockCreatedDoc);
    expect(mockDeleteDocumentFile).not.toHaveBeenCalled();
  });

  it("cleans up storage object and throws DatabaseError when DB insert fails after storage succeeds", async () => {
    const file = createValidPdfFile("will-fail-db.pdf");

    mockUploadDocumentFile.mockResolvedValueOnce(undefined);
    mockReturning.mockRejectedValueOnce(new Error("Connection terminated"));

    await expect(
      uploadDocument({
        userId: TEST_USER_ID,
        file,
      })
    ).rejects.toThrow(DatabaseError);

    // Storage upload succeeded
    expect(mockUploadDocumentFile).toHaveBeenCalledTimes(1);
    const uploadedPath = mockUploadDocumentFile.mock.calls[0][0];

    // Cleanup: storage deletion was triggered for the uploaded object
    expect(mockDeleteDocumentFile).toHaveBeenCalledTimes(1);
    expect(mockDeleteDocumentFile).toHaveBeenCalledWith(uploadedPath);
  });

  it("does not call storage or DB when file validation fails", async () => {
    const invalidFile = {
      name: "script.sh",
      type: "application/x-sh",
      size: 100,
      arrayBuffer: async () => Buffer.from("#!/bin/sh").buffer,
    };

    await expect(
      uploadDocument({
        userId: TEST_USER_ID,
        file: invalidFile,
      })
    ).rejects.toThrow(DocumentValidationError);

    expect(mockUploadDocumentFile).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockDeleteDocumentFile).not.toHaveBeenCalled();
  });

  it("does not attempt database insertion when storage upload fails", async () => {
    const file = createValidPdfFile("storage-fail.pdf");
    mockUploadDocumentFile.mockRejectedValueOnce(
      new Error("Supabase Storage unavailable")
    );

    await expect(
      uploadDocument({
        userId: TEST_USER_ID,
        file,
      })
    ).rejects.toThrow("Supabase Storage unavailable");

    // DB insert must never be reached if storage upload failed
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockDeleteDocumentFile).not.toHaveBeenCalled();
  });

  it("strictly enforces server-generated user namespace in storage path", async () => {
    const file = createValidPdfFile("traversal.pdf");
    const mockCreatedDoc = {
      id: "doc-uuid-5678",
      userId: TEST_USER_ID,
      title: "traversal.pdf",
      originalFilename: "traversal.pdf",
      storagePath: `${TEST_USER_ID}/doc-uuid-5678/traversal.pdf`,
      mimeType: "application/pdf",
      fileSizeBytes: file.size,
      status: "queued" as const,
      errorMessage: null,
      governingLaw: null,
      jurisdiction: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockReturning.mockResolvedValueOnce([mockCreatedDoc]);

    await uploadDocument({
      userId: TEST_USER_ID,
      file,
    });

    expect(mockUploadDocumentFile).toHaveBeenCalledTimes(1);
    const storagePath = mockUploadDocumentFile.mock.calls[0][0] as string;
    expect(storagePath.startsWith(`${TEST_USER_ID}/`)).toBe(true);
    expect(storagePath).not.toContain("..");
  });

  it("invokes processDocumentExtraction synchronously and returns ready document when processExtraction is true", async () => {
    const file = createValidPdfFile("auto-process.pdf");
    const mockCreatedDoc = {
      id: "doc-uuid-9999",
      userId: TEST_USER_ID,
      title: "auto-process.pdf",
      originalFilename: "auto-process.pdf",
      storagePath: `${TEST_USER_ID}/doc-uuid-9999/auto-process.pdf`,
      mimeType: "application/pdf",
      fileSizeBytes: file.size,
      pageCount: null,
      status: "queued" as const,
      errorMessage: null,
      governingLaw: null,
      jurisdiction: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockReturning.mockResolvedValueOnce([mockCreatedDoc]);

    const mockReadyDoc = {
      ...mockCreatedDoc,
      status: "ready" as const,
      pageCount: 2,
    };
    mockProcessDocumentExtraction.mockResolvedValueOnce({
      document: mockCreatedDoc,
      sections: [],
    });
    mockProcessDocumentIntelligence.mockResolvedValueOnce({
      document: mockReadyDoc,
      findings: [],
    });

    const result = await uploadDocument({
      userId: TEST_USER_ID,
      file,
      processExtraction: true,
    });

    expect(mockProcessDocumentExtraction).toHaveBeenCalledWith("doc-uuid-9999");
    expect(mockProcessDocumentIntelligence).toHaveBeenCalledWith("doc-uuid-9999");
    expect(result.status).toBe("ready");
    expect(result.pageCount).toBe(2);
  });
});

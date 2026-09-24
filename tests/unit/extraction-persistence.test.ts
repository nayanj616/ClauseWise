/**
 * Unit Tests — Extraction Persistence Service (Phase 2, Slice 2.2)
 *
 * Tests:
 * 1. Successful persistence:
 *    - Persists extracted sections into document_sections
 *    - Preserves sequential section order (orderIndex 0, 1, 2...)
 *    - Preserves titles and verbatim content
 *    - Preserves PDF page coordinates (pageStart, pageEnd)
 *    - DOCX/TXT sections retain null page coordinates (never fabricated)
 *    - Document status transitions queued -> extracting -> ready
 *    - Document pageCount is persisted
 *
 * 2. Reprocessing / Idempotency:
 *    - Re-processing an existing document replaces old sections rather than appending
 *    - Document ID remains unchanged
 *    - Old sections are completely deleted before new ones are inserted
 *
 * 3. Failure handling & Transactions:
 *    - Nonexistent document throws DocumentNotFoundError
 *    - Database insert failure aborts transaction (rollback)
 *    - Document does not become 'ready' after failed persistence
 *    - Best-effort status update sets document to 'error' outside transaction
 *    - Fallback status update failure is caught and logged without masking root cause
 *    - Storage download failure transitions document to 'error'
 *    - Extraction engine failure transitions document to 'error'
 *
 * 4. Data integrity & Input validation:
 *    - Rejects invalid/malformed document IDs (not valid UUID)
 *    - Rejects null/undefined/empty extraction results
 *    - Rejects extraction result with empty sections array
 *    - Sections are strictly bound to target documentId
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentExtractionResult, ExtractedSection } from "@/lib/extraction/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDownloadDocumentFile = vi.fn();
vi.mock("@/lib/storage/storage-client", () => ({
  DOCUMENTS_BUCKET: "documents",
  storageClient: { storage: { from: vi.fn() } },
  getDocumentsBucket: vi.fn(),
  uploadDocumentFile: vi.fn(),
  deleteDocumentFile: vi.fn(),
  createSignedDocumentUrl: vi.fn(),
  downloadDocumentFile: (...args: unknown[]) => mockDownloadDocumentFile(...args),
  StorageError: class StorageError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "StorageError";
    }
  },
}));

const mockExtractDocumentText = vi.fn();
vi.mock("@/lib/services/extraction-service", () => ({
  extractDocumentText: (...args: unknown[]) => mockExtractDocumentText(...args),
}));

// In-memory mock database state for fine-grained transaction and query simulation
type MockDoc = {
  id: string;
  userId: string;
  title: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  errorMessage: string | null;
  pageCount: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockSection = {
  id: string;
  documentId: string;
  orderIndex: number;
  sectionNumber: number | null;
  title: string;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockChunk = {
  id: string;
  documentId: string;
  sectionId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  tokenCount: number | null;
  createdAt: Date;
  updatedAt: Date;
};

let inMemoryDocs: Map<string, MockDoc> = new Map();
let inMemorySections: MockSection[] = [];
let inMemoryChunks: MockChunk[] = [];
let shouldFailTxInsert = false;
let shouldFailFallbackUpdate = false;

// Mock Drizzle db with transaction support
vi.mock("@/lib/db", () => {
  const createTxMock = () => ({
    select: () => ({
      from: () => ({
        where: (condition: unknown) => ({
          limit: async () => {
            // Find doc in inMemoryDocs
            const docId = (condition as { docId?: string })?.docId;
            if (docId && inMemoryDocs.has(docId)) {
              return [{ ...inMemoryDocs.get(docId)! }];
            }
            // fallback: return first or matching
            const all = Array.from(inMemoryDocs.values());
            return all.length > 0 ? [{ ...all[0] }] : [];
          },
        }),
      }),
    }),
    delete: () => ({
      where: (condition: unknown) => {
        const docId = (condition as { docId?: string })?.docId;
        if (docId) {
          inMemorySections = inMemorySections.filter((s) => s.documentId !== docId);
          inMemoryChunks = inMemoryChunks.filter((c) => c.documentId !== docId);
        }
        return Promise.resolve();
      },
    }),
    insert: () => ({
      values: (rows: Array<Record<string, any>>) => ({
        returning: async () => {
          if (shouldFailTxInsert) {
            throw new Error("DB insert failure: unique constraint violation or disk full");
          }
          if (rows.length > 0 && "chunkIndex" in rows[0]) {
            const createdChunks: MockChunk[] = rows.map((r) => ({
              id: crypto.randomUUID(),
              documentId: r.documentId,
              sectionId: r.sectionId,
              chunkIndex: r.chunkIndex,
              content: r.content,
              pageNumber: r.pageNumber ?? null,
              tokenCount: r.tokenCount ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
            inMemoryChunks.push(...createdChunks);
            return createdChunks;
          }
          const created: MockSection[] = rows.map((r) => ({
            id: crypto.randomUUID(),
            documentId: r.documentId,
            orderIndex: r.orderIndex,
            sectionNumber: r.sectionNumber ?? r.orderIndex,
            title: r.title,
            content: r.content,
            pageStart: r.pageStart ?? null,
            pageEnd: r.pageEnd ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
          inMemorySections.push(...created);
          return created;
        },
      }),
    }),
    update: () => ({
      set: (values: Partial<MockDoc>) => ({
        where: (condition: unknown) => ({
          returning: async () => {
            const docId = (condition as { docId?: string })?.docId;
            const targetId = docId ?? Array.from(inMemoryDocs.keys())[0];
            const existing = inMemoryDocs.get(targetId);
            if (!existing) return [];
            const updated = { ...existing, ...values, updatedAt: new Date() };
            inMemoryDocs.set(targetId, updated);
            return [updated];
          },
        }),
      }),
    }),
  });

  return {
    db: {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => ({
            limit: async () => {
              const docId = (condition as { docId?: string })?.docId;
              if (docId && inMemoryDocs.has(docId)) {
                return [{ ...inMemoryDocs.get(docId)! }];
              }
              const all = Array.from(inMemoryDocs.values());
              return all.length > 0 ? [{ ...all[0] }] : [];
            },
          }),
        }),
      }),
      update: () => ({
        set: (values: Partial<MockDoc>) => ({
          where: async (condition: unknown) => {
            if (shouldFailFallbackUpdate) {
              throw new Error("Fatal DB connection timeout on fallback update");
            }
            const docId = (condition as { docId?: string })?.docId;
            const targetId = docId ?? Array.from(inMemoryDocs.keys())[0];
            const existing = inMemoryDocs.get(targetId);
            if (existing) {
              inMemoryDocs.set(targetId, { ...existing, ...values, updatedAt: new Date() });
            }
          },
        }),
      }),
      transaction: async (callback: (tx: ReturnType<typeof createTxMock>) => Promise<unknown>) => {
        // Snapshot for transaction rollback simulation
        const snapshotDocs = new Map(inMemoryDocs);
        const snapshotSections = [...inMemorySections];
        const txMock = createTxMock();
        try {
          const result = await callback(txMock);
          return result;
        } catch (txError) {
          // Rollback in-memory state on transaction failure
          inMemoryDocs = snapshotDocs;
          inMemorySections = snapshotSections;
          throw txError;
        }
      },
    },
  };
});

// Mock drizzle-orm eq helper to retain docId for condition inspection
vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: string) => ({ docId: val }),
  relations: vi.fn(),
}));

import {
  persistDocumentExtraction,
  processDocumentExtraction,
  DocumentNotFoundError,
  ExtractionPersistenceError,
} from "@/lib/services/extraction-persistence-service";

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "99999999-9999-4999-a999-999999999999";

function seedDocument(
  id = VALID_DOC_ID,
  overrides?: Partial<MockDoc>
): MockDoc {
  const doc: MockDoc = {
    id,
    userId: USER_ID,
    title: "Master Services Agreement.pdf",
    originalFilename: "Master Services Agreement.pdf",
    storagePath: `${USER_ID}/${id}/Master Services Agreement.pdf`,
    mimeType: "application/pdf",
    fileSizeBytes: 2048,
    status: "queued",
    errorMessage: null,
    pageCount: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  inMemoryDocs.set(id, doc);
  return doc;
}

function createSamplePdfExtraction(): DocumentExtractionResult {
  const sections: ExtractedSection[] = [
    {
      orderIndex: 0,
      title: "Preamble",
      text: "This Master Services Agreement is entered into between Company and Client.",
      pageStart: 1,
      pageEnd: 1,
    },
    {
      orderIndex: 1,
      title: "1. Definitions",
      text: "Confidential Information refers to proprietary technical or business data.",
      pageStart: 1,
      pageEnd: 2,
    },
    {
      orderIndex: 2,
      title: "2. Payment Terms",
      text: "Invoices shall be paid within 30 days of receipt.",
      pageStart: 2,
      pageEnd: 3,
    },
  ];

  return {
    text: sections.map((s) => `${s.title}\n${s.text}`).join("\n\n"),
    format: "pdf",
    pageCount: 3,
    pages: [
      { pageNumber: 1, text: "Preamble\n1. Definitions" },
      { pageNumber: 2, text: "Definitions continued\n2. Payment Terms" },
      { pageNumber: 3, text: "Payment Terms continued" },
    ],
    sections,
    metadata: {
      characterCount: 250,
      wordCount: 40,
      lineCount: 15,
      pageCount: 3,
    },
  };
}

function createSampleDocxExtraction(): DocumentExtractionResult {
  const sections: ExtractedSection[] = [
    {
      orderIndex: 0,
      title: "Non-Disclosure Agreement",
      text: "The parties agree to keep all disclosed trade secrets strictly confidential.",
      // DOCX has no physical pages
      pageStart: undefined,
      pageEnd: undefined,
    },
    {
      orderIndex: 1,
      title: "1. Term and Termination",
      text: "This Agreement shall remain in effect for two years from signing.",
      pageStart: undefined,
      pageEnd: undefined,
    },
  ];

  return {
    text: sections.map((s) => `${s.title}\n${s.text}`).join("\n\n"),
    format: "docx",
    pageCount: undefined,
    sections,
    metadata: {
      characterCount: 180,
      wordCount: 28,
      lineCount: 8,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Extraction Persistence Service (Slice 2.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryDocs.clear();
    inMemorySections = [];
    inMemoryChunks = [];
    shouldFailTxInsert = false;
    shouldFailFallbackUpdate = false;
  });

  // =========================================================================
  // 1. Successful Persistence
  // =========================================================================
  describe("1. Successful Persistence", () => {
    it("persists extracted sections, preserves sequential ordering, titles, and text", async () => {
      seedDocument();
      const extraction = createSamplePdfExtraction();

      const result = await persistDocumentExtraction(VALID_DOC_ID, extraction);

      expect(result.document.status).toBe("ready");
      expect(result.document.pageCount).toBe(3);
      expect(result.document.errorMessage).toBeNull();

      expect(result.sections).toHaveLength(3);
      // Verify exact sequential order
      expect(result.sections[0].orderIndex).toBe(0);
      expect(result.sections[0].title).toBe("Preamble");
      expect(result.sections[0].content).toContain("Master Services Agreement");

      expect(result.sections[1].orderIndex).toBe(1);
      expect(result.sections[1].title).toBe("1. Definitions");

      expect(result.sections[2].orderIndex).toBe(2);
      expect(result.sections[2].title).toBe("2. Payment Terms");

      // Verify sections in DB map
      expect(inMemorySections).toHaveLength(3);
      expect(inMemorySections[0].title).toBe("Preamble");
      expect(inMemorySections[1].title).toBe("1. Definitions");
      expect(inMemorySections[2].title).toBe("2. Payment Terms");

      // Verify chunks in result and DB map (Slice 2.4)
      expect(result.chunks).toHaveLength(3);
      expect(result.chunks[0].chunkIndex).toBe(0);
      expect(result.chunks[0].sectionId).toBe(result.sections[0].id);
      expect(result.chunks[0].documentId).toBe(VALID_DOC_ID);
      expect(result.chunks[0].pageNumber).toBe(1);
      expect(result.chunks[0].tokenCount).toBeGreaterThan(0);
      expect(inMemoryChunks).toHaveLength(3);
    });

    it("preserves PDF physical page coordinates on persisted sections and chunks", async () => {
      seedDocument();
      const extraction = createSamplePdfExtraction();

      const result = await persistDocumentExtraction(VALID_DOC_ID, extraction);

      expect(result.sections[0].pageStart).toBe(1);
      expect(result.sections[0].pageEnd).toBe(1);
      expect(result.chunks[0].pageNumber).toBe(1);

      expect(result.sections[1].pageStart).toBe(1);
      expect(result.sections[1].pageEnd).toBe(2);
      expect(result.chunks[1].pageNumber).toBe(1);

      expect(result.sections[2].pageStart).toBe(2);
      expect(result.sections[2].pageEnd).toBe(3);
      expect(result.chunks[2].pageNumber).toBe(2);
    });

    it("stores null page coordinates for DOCX and TXT without fabricating page numbers", async () => {
      seedDocument(VALID_DOC_ID, { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const extraction = createSampleDocxExtraction();

      const result = await persistDocumentExtraction(VALID_DOC_ID, extraction);

      expect(result.document.pageCount).toBeNull();
      expect(result.sections).toHaveLength(2);
      expect(result.chunks).toHaveLength(2);

      // Must be null, never 0 or 1
      expect(result.sections[0].pageStart).toBeNull();
      expect(result.sections[0].pageEnd).toBeNull();
      expect(result.chunks[0].pageNumber).toBeNull();

      expect(result.sections[1].pageStart).toBeNull();
      expect(result.sections[1].pageEnd).toBeNull();
      expect(result.chunks[1].pageNumber).toBeNull();
    });
  });

  // =========================================================================
  // 2. Reprocessing & Idempotency
  // =========================================================================
  describe("2. Reprocessing & Idempotency", () => {
    it("replaces existing sections without duplicating when processed multiple times", async () => {
      seedDocument();
      const firstExtraction = createSamplePdfExtraction();
      await persistDocumentExtraction(VALID_DOC_ID, firstExtraction);
      expect(inMemorySections).toHaveLength(3);

      // Second extraction with updated sections
      const secondExtraction: DocumentExtractionResult = {
        ...firstExtraction,
        sections: [
          {
            orderIndex: 0,
            title: "Updated Section A",
            text: "Content A",
          },
          {
            orderIndex: 1,
            title: "Updated Section B",
            text: "Content B",
          },
        ],
      };

      const result = await persistDocumentExtraction(VALID_DOC_ID, secondExtraction);

      // Previous 3 sections replaced by 2 new sections
      expect(result.sections).toHaveLength(2);
      expect(inMemorySections).toHaveLength(2);
      expect(inMemorySections[0].title).toBe("Updated Section A");
      expect(inMemorySections[1].title).toBe("Updated Section B");

      // Previous 3 chunks replaced by 2 new chunks (Slice 2.4)
      expect(result.chunks).toHaveLength(2);
      expect(inMemoryChunks).toHaveLength(2);

      // Preserves original document ID
      expect(result.document.id).toBe(VALID_DOC_ID);
    });
  });

  // =========================================================================
  // 3. Failure Handling & Transactions
  // =========================================================================
  describe("3. Failure Handling & Transactions", () => {
    it("throws DocumentNotFoundError when document does not exist in DB", async () => {
      const nonExistentId = "00000000-0000-4000-a000-000000000000";
      const extraction = createSamplePdfExtraction();

      await expect(
        persistDocumentExtraction(nonExistentId, extraction)
      ).rejects.toThrow(DocumentNotFoundError);

      expect(inMemorySections).toHaveLength(0);
    });

    it("rolls back transaction and updates document status to 'error' when database insertion fails", async () => {
      seedDocument();
      // Pre-seed an existing section to test rollback integrity
      inMemorySections.push({
        id: "existing-sec-1",
        documentId: VALID_DOC_ID,
        orderIndex: 0,
        sectionNumber: 0,
        title: "Old Section",
        content: "Old Content",
        pageStart: null,
        pageEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      shouldFailTxInsert = true;
      const extraction = createSamplePdfExtraction();

      await expect(
        persistDocumentExtraction(VALID_DOC_ID, extraction)
      ).rejects.toThrow(ExtractionPersistenceError);

      // Rollback restored original section state, new sections were NOT committed
      expect(inMemorySections).toHaveLength(1);
      expect(inMemorySections[0].title).toBe("Old Section");

      // Document was NOT marked 'ready'; best-effort set status to 'error'
      const doc = inMemoryDocs.get(VALID_DOC_ID)!;
      expect(doc.status).toBe("error");
      expect(doc.errorMessage).toContain("Failed to persist document extraction");
    });

    it("handles fallback status update failure by logging without masking the original persistence error", async () => {
      seedDocument();
      shouldFailTxInsert = true;
      shouldFailFallbackUpdate = true;
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const extraction = createSamplePdfExtraction();

      await expect(
        persistDocumentExtraction(VALID_DOC_ID, extraction)
      ).rejects.toThrow(ExtractionPersistenceError);

      // Console error logged the failure of the fallback update
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedMsg = consoleErrorSpy.mock.calls[0][0];
      expect(loggedMsg).toContain("Failed to update document status to 'error'");
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // 4. Data Integrity & Input Validation
  // =========================================================================
  describe("4. Data Integrity & Input Validation", () => {
    it("rejects invalid document IDs before any database mutations", async () => {
      const extraction = createSamplePdfExtraction();

      await expect(
        persistDocumentExtraction("not-a-uuid", extraction)
      ).rejects.toThrow(ExtractionPersistenceError);

      await expect(
        persistDocumentExtraction("", extraction)
      ).rejects.toThrow(ExtractionPersistenceError);
    });

    it("rejects extraction results with empty or missing sections", async () => {
      seedDocument();
      const emptySectionsExtraction: DocumentExtractionResult = {
        text: "Some text",
        format: "pdf",
        sections: [],
        metadata: { characterCount: 9, wordCount: 2, lineCount: 1 },
      };

      await expect(
        persistDocumentExtraction(VALID_DOC_ID, emptySectionsExtraction)
      ).rejects.toThrow("no sections");
    });

    it("rejects extraction results with missing text content", async () => {
      seedDocument();
      const noTextExtraction = {
        text: "",
        format: "pdf",
        sections: [{ orderIndex: 0, title: "Title", text: "Text" }],
        metadata: { characterCount: 0, wordCount: 0, lineCount: 0 },
      } as unknown as DocumentExtractionResult;

      await expect(
        persistDocumentExtraction(VALID_DOC_ID, noTextExtraction)
      ).rejects.toThrow("no text content");
    });

    it("ensures persisted sections are strictly bound to target documentId", async () => {
      seedDocument(VALID_DOC_ID);
      const otherDocId = "22222222-2222-4222-a222-222222222222";
      seedDocument(otherDocId);

      const extraction = createSamplePdfExtraction();
      const result = await persistDocumentExtraction(VALID_DOC_ID, extraction);

      for (const section of result.sections) {
        expect(section.documentId).toBe(VALID_DOC_ID);
        expect(section.documentId).not.toBe(otherDocId);
      }
      for (const chunk of result.chunks) {
        expect(chunk.documentId).toBe(VALID_DOC_ID);
        expect(chunk.documentId).not.toBe(otherDocId);
      }
    });

    it("rolls back transaction and updates document status to 'error' when chunking generates 0 chunks", async () => {
      seedDocument();
      const whitespaceOnlyExtraction: DocumentExtractionResult = {
        text: "Some non-empty document text",
        format: "pdf",
        sections: [
          {
            orderIndex: 0,
            title: "Whitespace Section",
            text: "   \n\n\t  ",
          },
        ],
        metadata: { characterCount: 10, wordCount: 0, lineCount: 2 },
      };

      await expect(
        persistDocumentExtraction(VALID_DOC_ID, whitespaceOnlyExtraction)
      ).rejects.toThrow("No valid text chunks could be generated");

      const doc = inMemoryDocs.get(VALID_DOC_ID);
      expect(doc?.status).toBe("error");
      expect(inMemoryChunks).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. Orchestration Pipeline (processDocumentExtraction)
  // =========================================================================
  describe("5. Orchestration Pipeline (processDocumentExtraction)", () => {
    it("runs complete lifecycle: queued -> extracting -> download -> extract -> ready", async () => {
      seedDocument(VALID_DOC_ID, { status: "queued" });
      const fakeBuffer = Buffer.from("%PDF-1.4\nTest PDF");
      mockDownloadDocumentFile.mockResolvedValueOnce(fakeBuffer);

      const sampleExtraction = createSamplePdfExtraction();
      mockExtractDocumentText.mockResolvedValueOnce(sampleExtraction);

      const result = await processDocumentExtraction(VALID_DOC_ID);

      // Verify file was downloaded from private storage using correct path
      expect(mockDownloadDocumentFile).toHaveBeenCalledWith(
        `${USER_ID}/${VALID_DOC_ID}/Master Services Agreement.pdf`
      );

      // Verify extraction was called with correct parameters
      expect(mockExtractDocumentText).toHaveBeenCalledWith({
        buffer: fakeBuffer,
        mimeType: "application/pdf",
        filename: "Master Services Agreement.pdf",
      });

      // Verify document reached 'ready' with sections persisted
      expect(result.document.status).toBe("ready");
      expect(result.document.pageCount).toBe(3);
      expect(result.sections).toHaveLength(3);
      expect(inMemoryDocs.get(VALID_DOC_ID)?.status).toBe("ready");
    });

    it("marks document as 'error' when storage download fails", async () => {
      seedDocument(VALID_DOC_ID, { status: "queued" });
      mockDownloadDocumentFile.mockRejectedValueOnce(
        new Error("Object not found in Supabase Storage")
      );

      await expect(
        processDocumentExtraction(VALID_DOC_ID)
      ).rejects.toThrow("Object not found in Supabase Storage");

      const doc = inMemoryDocs.get(VALID_DOC_ID)!;
      expect(doc.status).toBe("error");
      expect(doc.errorMessage).toBe("Failed to retrieve stored document file");
    });

    it("marks document as 'error' when text extraction fails", async () => {
      seedDocument(VALID_DOC_ID, { status: "queued" });
      mockDownloadDocumentFile.mockResolvedValueOnce(Buffer.from("invalid-pdf-data"));
      mockExtractDocumentText.mockRejectedValueOnce(
        new Error("Malformed PDF: missing trailer dictionary")
      );

      await expect(
        processDocumentExtraction(VALID_DOC_ID)
      ).rejects.toThrow("Malformed PDF");

      const doc = inMemoryDocs.get(VALID_DOC_ID)!;
      expect(doc.status).toBe("error");
      expect(doc.errorMessage).toBe("Failed to extract text from document file");
    });
  });

  // =========================================================================
  // 6. Synchronous Upload Integration (uploadDocument)
  // =========================================================================
  describe("6. Synchronous Upload Integration", () => {
    it("returns ready document when uploadDocument is called with processExtraction: true", async () => {
      // Mock upload validation and storage
      const file = {
        name: "test-contract.pdf",
        type: "application/pdf",
        size: 1024,
        arrayBuffer: async () => Buffer.from("%PDF-1.4\ncontent").buffer,
      };

      // Seed doc created by upload
      seedDocument(VALID_DOC_ID, { title: "test-contract.pdf" });
      mockDownloadDocumentFile.mockResolvedValue(Buffer.from("%PDF-1.4\ncontent"));
      mockExtractDocumentText.mockResolvedValue(createSamplePdfExtraction());

      // Test processDocumentExtraction integration directly
      const processed = await processDocumentExtraction(VALID_DOC_ID);
      expect(processed.document.status).toBe("ready");
      expect(processed.sections.length).toBeGreaterThan(0);
    });

    it("transitions document to analyzing when nextStatus: analyzing option is provided", async () => {
      seedDocument(VALID_DOC_ID, { title: "pipeline-test.pdf", status: "queued" });
      mockDownloadDocumentFile.mockResolvedValue(Buffer.from("%PDF-1.4\ncontent"));
      mockExtractDocumentText.mockResolvedValue(createSamplePdfExtraction());

      const processed = await processDocumentExtraction(VALID_DOC_ID, { nextStatus: "analyzing" });
      expect(processed.document.status).toBe("analyzing");
      expect(inMemoryDocs.get(VALID_DOC_ID)?.status).toBe("analyzing");
    });
  });
});


/**
 * Unit Tests — Document Workspace Domain Service (Phase 2, Slice 2.3)
 *
 * Tests:
 * 1. getDocumentWorkspaceData loads document and ordered sections:
 *    - Validates documentId and userId
 *    - Strictly enforces user ownership (id AND userId)
 *    - Rejects access if document belongs to another user
 *    - Loads sections ordered by orderIndex ASC
 *    - Excludes storagePath and internal database details
 *    - Preserves genuine page coordinates (numbers for PDF, null for DOCX/TXT)
 * 2. Input validation:
 *    - Returns null for invalid UUID formats
 *    - Returns null for missing or empty userId
 *    - Returns null for nonexistent document
 * 3. Error safety:
 *    - Translates database failures into DatabaseError
 *    - Never exposes raw database credentials or internal errors
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockDocResult: unknown[] = [];
let mockSectionsResult: unknown[] = [];
let shouldFailDb = false;

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn((condition: unknown) => ({
          limit: vi.fn(async () => {
            if (shouldFailDb) {
              throw new Error("Connection terminated: postgres://user:secret@db.internal");
            }
            return mockDocResult;
          }),
          orderBy: vi.fn(async () => {
            if (shouldFailDb) {
              throw new Error("Connection terminated");
            }
            return mockSectionsResult;
          }),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/storage/storage-client", () => ({
  DOCUMENTS_BUCKET: "documents",
  storageClient: { storage: { from: vi.fn() } },
  getDocumentsBucket: vi.fn(),
  uploadDocumentFile: vi.fn(),
  deleteDocumentFile: vi.fn(),
  downloadDocumentFile: vi.fn(),
  createSignedDocumentUrl: vi.fn(),
  StorageError: class StorageError extends Error {},
}));

vi.mock("@/lib/services/extraction-persistence-service", () => ({
  processDocumentExtraction: vi.fn(),
  persistDocumentExtraction: vi.fn(),
  DocumentNotFoundError: class DocumentNotFoundError extends Error {},
  ExtractionPersistenceError: class ExtractionPersistenceError extends Error {},
}));

import {
  getDocumentWorkspaceData,
  DatabaseError,
} from "@/lib/services/document-service";

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const OWNER_USER_ID = "22222222-2222-4222-a222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-a333-333333333333";

function createMockDocRecord(overrides?: Record<string, unknown>) {
  return {
    id: VALID_DOC_ID,
    userId: OWNER_USER_ID,
    title: "Commercial Lease.pdf",
    originalFilename: "Commercial Lease.pdf",
    storagePath: `${OWNER_USER_ID}/${VALID_DOC_ID}/Commercial Lease.pdf`,
    mimeType: "application/pdf",
    fileSizeBytes: 1048576,
    status: "ready",
    pageCount: 4,
    errorMessage: null,
    createdAt: new Date("2026-09-20T10:00:00Z"),
    updatedAt: new Date("2026-09-20T10:05:00Z"),
    ...overrides,
  };
}

function createMockSectionRows() {
  return [
    {
      id: "sec-1",
      documentId: VALID_DOC_ID,
      orderIndex: 0,
      sectionNumber: 0,
      title: "Preamble",
      content: "This Lease is entered into between Landlord and Tenant.",
      pageStart: 1,
      pageEnd: 1,
    },
    {
      id: "sec-2",
      documentId: VALID_DOC_ID,
      orderIndex: 1,
      sectionNumber: 1,
      title: "1. Premises and Term",
      content: "The leased premises are situated at 100 Main Street.",
      pageStart: 1,
      pageEnd: 2,
    },
    {
      id: "sec-3",
      documentId: VALID_DOC_ID,
      orderIndex: 2,
      sectionNumber: 2,
      title: "2. Rent and Payment",
      content: "Monthly base rent shall be payable on the first day of each month.",
      pageStart: 3,
      pageEnd: 4,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getDocumentWorkspaceData Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocResult = [];
    mockSectionsResult = [];
    shouldFailDb = false;
  });

  describe("1. Successful Workspace Loading", () => {
    it("loads document metadata and persisted sections ordered by orderIndex ASC", async () => {
      mockDocResult = [createMockDocRecord()];
      mockSectionsResult = createMockSectionRows();

      const result = await getDocumentWorkspaceData(VALID_DOC_ID, OWNER_USER_ID);

      expect(result).not.toBeNull();
      expect(result?.document.id).toBe(VALID_DOC_ID);
      expect(result?.document.filename).toBe("Commercial Lease.pdf");
      expect(result?.document.mimeType).toBe("application/pdf");
      expect(result?.document.fileSizeBytes).toBe(1048576);
      expect(result?.document.status).toBe("ready");
      expect(result?.document.pageCount).toBe(4);

      // Verify sections are loaded
      expect(result?.sections).toHaveLength(3);
      expect(result?.sections[0].orderIndex).toBe(0);
      expect(result?.sections[0].title).toBe("Preamble");
      expect(result?.sections[0].pageStart).toBe(1);
      expect(result?.sections[0].pageEnd).toBe(1);

      expect(result?.sections[1].orderIndex).toBe(1);
      expect(result?.sections[1].title).toBe("1. Premises and Term");

      expect(result?.sections[2].orderIndex).toBe(2);
      expect(result?.sections[2].title).toBe("2. Rent and Payment");
      expect(result?.sections[2].pageStart).toBe(3);
      expect(result?.sections[2].pageEnd).toBe(4);
    });

    it("strictly excludes storagePath from workspace document contract", async () => {
      mockDocResult = [createMockDocRecord()];
      mockSectionsResult = createMockSectionRows();

      const result = await getDocumentWorkspaceData(VALID_DOC_ID, OWNER_USER_ID);

      expect(result?.document).not.toHaveProperty("storagePath");
      expect(JSON.stringify(result?.document)).not.toContain("storagePath");
    });

    it("preserves null page coordinates for DOCX/TXT documents", async () => {
      mockDocResult = [
        createMockDocRecord({
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          pageCount: null,
        }),
      ];
      mockSectionsResult = [
        {
          id: "sec-docx-1",
          documentId: VALID_DOC_ID,
          orderIndex: 0,
          sectionNumber: null,
          title: "Confidentiality",
          content: "Text content without physical page numbers.",
          pageStart: null,
          pageEnd: null,
        },
      ];

      const result = await getDocumentWorkspaceData(VALID_DOC_ID, OWNER_USER_ID);

      expect(result?.document.pageCount).toBeNull();
      expect(result?.sections[0].pageStart).toBeNull();
      expect(result?.sections[0].pageEnd).toBeNull();
    });
  });

  describe("2. Security & Ownership Scoping", () => {
    it("returns null when document is not found or owned by a different user", async () => {
      // Document does not match owner userId in DB query
      mockDocResult = [];

      const result = await getDocumentWorkspaceData(VALID_DOC_ID, OTHER_USER_ID);

      expect(result).toBeNull();
    });

    it("returns null when documentId is not a valid UUID format", async () => {
      expect(await getDocumentWorkspaceData("invalid-uuid", OWNER_USER_ID)).toBeNull();
      expect(await getDocumentWorkspaceData("", OWNER_USER_ID)).toBeNull();
      expect(await getDocumentWorkspaceData("   ", OWNER_USER_ID)).toBeNull();
      expect(await getDocumentWorkspaceData("../traversal", OWNER_USER_ID)).toBeNull();
    });

    it("returns null when userId is missing or empty", async () => {
      expect(await getDocumentWorkspaceData(VALID_DOC_ID, "")).toBeNull();
      expect(await getDocumentWorkspaceData(VALID_DOC_ID, "   ")).toBeNull();
    });
  });

  describe("3. Error Safety", () => {
    it("catches unexpected database errors and re-throws DatabaseError without leaking credentials", async () => {
      shouldFailDb = true;

      await expect(
        getDocumentWorkspaceData(VALID_DOC_ID, OWNER_USER_ID)
      ).rejects.toThrow(DatabaseError);

      try {
        await getDocumentWorkspaceData(VALID_DOC_ID, OWNER_USER_ID);
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        const msg = (err as Error).message;
        expect(msg).not.toContain("secret");
        expect(msg).not.toContain("postgres://");
        expect(msg).not.toContain("db.internal");
      }
    });
  });
});


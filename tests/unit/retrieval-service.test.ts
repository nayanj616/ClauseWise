/**
 * Unit Tests — Retrieval Domain Service (Phase 4 Slice 4.1)
 *
 * Covers:
 * 1. findingsByDocument:
 *    - Returns only findings belonging to the authenticated user's document
 *    - Preserves canonical ordering (pageNumber ASC, createdAt ASC)
 *    - Enforces ownership: returns empty array if document belongs to another user
 * 2. findingsByType:
 *    - Filters findings strictly by findingType
 *    - Preserves canonical ordering
 *    - Enforces ownership: returns empty array if document belongs to another user
 *    - Rejects invalid finding types safely
 * 3. findingWithEvidence:
 *    - Returns finding along with associated section and chunk evidence
 *    - Rejects cross-user access (finding belongs to document owned by another user)
 *    - missing_information returns section: null, chunk: null (zero fabricated evidence)
 *    - Handles substantive findings with missing/deleted section gracefully
 * 4. Identifier validation:
 *    - Malformed UUIDs (e.g. "invalid-uuid", "", "   ", non-strings) safely rejected
 *    - Empty or invalid userId safely rejected
 * 5. Database error safety:
 *    - Re-throws DatabaseError on unexpected errors without exposing secrets or credentials
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  documents,
  documentSections,
  documentChunks,
  documentFindings,
  type DocumentFinding,
  type DocumentSection,
  type DocumentChunk,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Database Mock Setup
// ---------------------------------------------------------------------------

let mockDocRecords: unknown[] = [];
let mockFindingRecords: unknown[] = [];
let mockSectionRecords: unknown[] = [];
let mockChunkRecords: unknown[] = [];
let shouldFailDb = false;

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn((_fields?: unknown) => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn((_condition: unknown) => ({
            limit: vi.fn(async (_n?: number) => {
              if (shouldFailDb) {
                throw new Error("Connection terminated: postgres://admin:super_secret@db.internal:5432");
              }
              if (table === documents) return mockDocRecords;
              if (table === documentFindings) return mockFindingRecords;
              if (table === documentSections) return mockSectionRecords;
              if (table === documentChunks) return mockChunkRecords;
              return [];
            }),
            orderBy: vi.fn(async (..._args: unknown[]) => {
              if (shouldFailDb) {
                throw new Error("Connection terminated: postgres://admin:super_secret@db.internal:5432");
              }
              if (table === documentFindings) return mockFindingRecords;
              if (table === documentSections) return mockSectionRecords;
              return [];
            }),
          })),
        })),
      })),
    },
  };
});

import {
  findingsByDocument,
  findingsByType,
  findingWithEvidence,
  DatabaseError,
} from "@/lib/services/retrieval-service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OWNER_USER_ID = "22222222-2222-4222-a222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-a333-333333333333";
const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";

const FINDING_ID_1 = "aaaaaaaa-1111-4111-a111-111111111111";
const FINDING_ID_2 = "bbbbbbbb-2222-4222-a222-222222222222";
const FINDING_ID_MISSING = "cccccccc-3333-4333-a333-333333333333";

const SECTION_ID_1 = "dddddddd-4444-4444-a444-444444444444";
const CHUNK_ID_1 = "eeeeeeee-5555-5555-a555-555555555555";

function createMockDocRecord(overrides?: Record<string, unknown>) {
  return {
    id: VALID_DOC_ID,
    userId: OWNER_USER_ID,
    title: "Services Agreement.pdf",
    status: "ready",
    ...overrides,
  };
}

function createMockFinding(overrides?: Partial<DocumentFinding>): DocumentFinding {
  return {
    id: FINDING_ID_1,
    documentId: VALID_DOC_ID,
    sectionId: SECTION_ID_1,
    chunkId: CHUNK_ID_1,
    findingType: "obligation",
    importance: "needs_attention",
    label: "Payment Due Date",
    summary: "Fees must be remitted within thirty (30) days.",
    sourceText: "Fees must be remitted within thirty (30) days of invoice date.",
    pageNumber: 2,
    metadata: null,
    createdAt: new Date("2026-09-21T10:00:00Z"),
    updatedAt: new Date("2026-09-21T10:00:00Z"),
    ...overrides,
  };
}

function createMockSection(overrides?: Partial<DocumentSection>): DocumentSection {
  return {
    id: SECTION_ID_1,
    documentId: VALID_DOC_ID,
    orderIndex: 1,
    sectionNumber: 2,
    title: "Section 2: Payment Terms",
    content: "Fees must be remitted within thirty (30) days of invoice date. Late charges of 1.5% apply.",
    pageStart: 2,
    pageEnd: 2,
    createdAt: new Date("2026-09-21T09:00:00Z"),
    updatedAt: new Date("2026-09-21T09:00:00Z"),
    ...overrides,
  };
}

function createMockChunk(overrides?: Partial<DocumentChunk>): DocumentChunk {
  return {
    id: CHUNK_ID_1,
    documentId: VALID_DOC_ID,
    sectionId: SECTION_ID_1,
    chunkIndex: 1,
    content: "Fees must be remitted within thirty (30) days of invoice date.",
    pageNumber: 2,
    tokenCount: 15,
    createdAt: new Date("2026-09-21T09:01:00Z"),
    updatedAt: new Date("2026-09-21T09:01:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe("Phase 4.1 — Retrieval Domain Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocRecords = [];
    mockFindingRecords = [];
    mockSectionRecords = [];
    mockChunkRecords = [];
    shouldFailDb = false;
  });

  // =========================================================================
  // 1. findingsByDocument
  // =========================================================================
  describe("1. findingsByDocument", () => {
    it("returns only findings belonging to the requested user's document", async () => {
      mockDocRecords = [createMockDocRecord()];
      const finding1 = createMockFinding({ id: FINDING_ID_1, label: "Payment Due Date" });
      const finding2 = createMockFinding({
        id: FINDING_ID_2,
        findingType: "key_term",
        importance: "informational",
        label: "Confidentiality Definition",
        pageNumber: 1,
      });
      mockFindingRecords = [finding2, finding1];

      const findings = await findingsByDocument(VALID_DOC_ID, OWNER_USER_ID);

      expect(findings).toHaveLength(2);
      expect(findings[0].id).toBe(FINDING_ID_2);
      expect(findings[1].id).toBe(FINDING_ID_1);
      expect(findings.every((f) => f.documentId === VALID_DOC_ID)).toBe(true);
    });

    it("preserves established ordering (pageNumber ASC, createdAt ASC)", async () => {
      mockDocRecords = [createMockDocRecord()];
      const findingPage1 = createMockFinding({
        id: FINDING_ID_1,
        pageNumber: 1,
        createdAt: new Date("2026-09-21T10:00:00Z"),
      });
      const findingPage2 = createMockFinding({
        id: FINDING_ID_2,
        pageNumber: 2,
        createdAt: new Date("2026-09-21T10:01:00Z"),
      });
      const findingMissingNullPage = createMockFinding({
        id: FINDING_ID_MISSING,
        pageNumber: null,
        createdAt: new Date("2026-09-21T10:02:00Z"),
      });

      // DB mock returns ordered records as requested by query
      mockFindingRecords = [findingPage1, findingPage2, findingMissingNullPage];

      const findings = await findingsByDocument(VALID_DOC_ID, OWNER_USER_ID);

      expect(findings[0].pageNumber).toBe(1);
      expect(findings[1].pageNumber).toBe(2);
      expect(findings[2].pageNumber).toBeNull();
    });

    it("enforces ownership and returns empty array if document belongs to another user", async () => {
      // Document ownership check fails (doc not returned for OTHER_USER_ID)
      mockDocRecords = [];
      mockFindingRecords = [createMockFinding()];

      const findings = await findingsByDocument(VALID_DOC_ID, OTHER_USER_ID);

      expect(findings).toEqual([]);
    });

    it("returns empty array if document does not exist", async () => {
      mockDocRecords = [];
      mockFindingRecords = [];

      const findings = await findingsByDocument(VALID_DOC_ID, OWNER_USER_ID);

      expect(findings).toEqual([]);
    });
  });

  // =========================================================================
  // 2. findingsByType
  // =========================================================================
  describe("2. findingsByType", () => {
    it("filters correctly by findingType", async () => {
      mockDocRecords = [createMockDocRecord()];
      const obligationFinding = createMockFinding({
        id: FINDING_ID_1,
        findingType: "obligation",
        label: "Duty to Maintain",
      });
      mockFindingRecords = [obligationFinding];

      const findings = await findingsByType(VALID_DOC_ID, "obligation", OWNER_USER_ID);

      expect(findings).toHaveLength(1);
      expect(findings[0].findingType).toBe("obligation");
      expect(findings[0].label).toBe("Duty to Maintain");
    });

    it("enforces ownership and returns empty array if document belongs to another user", async () => {
      mockDocRecords = [];
      mockFindingRecords = [createMockFinding({ findingType: "obligation" })];

      const findings = await findingsByType(VALID_DOC_ID, "obligation", OTHER_USER_ID);

      expect(findings).toEqual([]);
    });

    it("returns empty array for an invalid or unsupported finding type", async () => {
      mockDocRecords = [createMockDocRecord()];

      // @ts-expect-error Testing runtime handling of invalid type
      const findings = await findingsByType(VALID_DOC_ID, "invalid_type", OWNER_USER_ID);

      expect(findings).toEqual([]);
    });
  });

  // =========================================================================
  // 3. findingWithEvidence
  // =========================================================================
  describe("3. findingWithEvidence", () => {
    it("returns the finding together with associated section and chunk evidence", async () => {
      const finding = createMockFinding();
      const section = createMockSection();
      const chunk = createMockChunk();

      mockFindingRecords = [finding];
      mockDocRecords = [createMockDocRecord()];
      mockSectionRecords = [section];
      mockChunkRecords = [chunk];

      const result = await findingWithEvidence(FINDING_ID_1, OWNER_USER_ID);

      expect(result).not.toBeNull();
      expect(result?.finding.id).toBe(FINDING_ID_1);
      expect(result?.finding.sourceText).toBe(
        "Fees must be remitted within thirty (30) days of invoice date."
      );
      expect(result?.section).not.toBeNull();
      expect(result?.section?.id).toBe(SECTION_ID_1);
      expect(result?.section?.title).toBe("Section 2: Payment Terms");
      expect(result?.section?.orderIndex).toBe(1);
      expect(result?.chunk).not.toBeNull();
      expect(result?.chunk?.id).toBe(CHUNK_ID_1);
      expect(result?.chunk?.content).toBe(
        "Fees must be remitted within thirty (30) days of invoice date."
      );
    });

    it("rejects cross-user access when document is owned by a different user", async () => {
      const finding = createMockFinding();
      mockFindingRecords = [finding];
      // Ownership check returns empty because OTHER_USER_ID does not own this document
      mockDocRecords = [];

      const result = await findingWithEvidence(FINDING_ID_1, OTHER_USER_ID);

      expect(result).toBeNull();
    });

    it("returns null if finding does not exist", async () => {
      mockFindingRecords = [];
      mockDocRecords = [createMockDocRecord()];

      const result = await findingWithEvidence(FINDING_ID_1, OWNER_USER_ID);

      expect(result).toBeNull();
    });

    it("missing_information finding returns section: null, chunk: null (no fabricated evidence)", async () => {
      const missingFinding = createMockFinding({
        id: FINDING_ID_MISSING,
        findingType: "missing_information",
        importance: "important",
        label: "Missing Severability Clause",
        summary: "No standard severability provision was detected.",
        sourceText: null,
        sectionId: null,
        chunkId: null,
        pageNumber: null,
        metadata: {
          expectedTopic: "severability_clause",
          ruleBasis: "Commercial contracts standard expectation",
        },
      });

      mockFindingRecords = [missingFinding];
      mockDocRecords = [createMockDocRecord()];
      // Ensure no section or chunk is queried
      mockSectionRecords = [];
      mockChunkRecords = [];

      const result = await findingWithEvidence(FINDING_ID_MISSING, OWNER_USER_ID);

      expect(result).not.toBeNull();
      expect(result?.finding.id).toBe(FINDING_ID_MISSING);
      expect(result?.finding.findingType).toBe("missing_information");
      expect(result?.finding.sourceText).toBeNull();
      expect(result?.finding.sectionId).toBeNull();
      expect(result?.finding.chunkId).toBeNull();
      expect(result?.section).toBeNull();
      expect(result?.chunk).toBeNull();
    });

    it("handles substantive finding where referenced section was deleted/not found gracefully", async () => {
      const findingWithOrphanSection = createMockFinding({
        sectionId: "ffffffff-9999-4999-a999-999999999999",
        chunkId: null,
      });

      mockFindingRecords = [findingWithOrphanSection];
      mockDocRecords = [createMockDocRecord()];
      mockSectionRecords = []; // Section query returns empty
      mockChunkRecords = [];

      const result = await findingWithEvidence(FINDING_ID_1, OWNER_USER_ID);

      expect(result).not.toBeNull();
      expect(result?.finding.id).toBe(FINDING_ID_1);
      expect(result?.section).toBeNull();
      expect(result?.chunk).toBeNull();
    });
  });

  // =========================================================================
  // 4. Identifier Validation & Conventions
  // =========================================================================
  describe("4. Identifier & Parameter Validation", () => {
    it("findingsByDocument returns empty array for invalid documentId", async () => {
      expect(await findingsByDocument("not-a-uuid", OWNER_USER_ID)).toEqual([]);
      expect(await findingsByDocument("", OWNER_USER_ID)).toEqual([]);
      expect(await findingsByDocument("   ", OWNER_USER_ID)).toEqual([]);
      // @ts-expect-error Testing non-string handling
      expect(await findingsByDocument(12345, OWNER_USER_ID)).toEqual([]);
      // @ts-expect-error Testing null handling
      expect(await findingsByDocument(null, OWNER_USER_ID)).toEqual([]);
    });

    it("findingsByDocument returns empty array for invalid userId", async () => {
      expect(await findingsByDocument(VALID_DOC_ID, "")).toEqual([]);
      expect(await findingsByDocument(VALID_DOC_ID, "   ")).toEqual([]);
      // @ts-expect-error Testing non-string handling
      expect(await findingsByDocument(VALID_DOC_ID, null)).toEqual([]);
    });

    it("findingsByType returns empty array for invalid documentId or userId", async () => {
      expect(await findingsByType("not-a-uuid", "obligation", OWNER_USER_ID)).toEqual([]);
      expect(await findingsByType(VALID_DOC_ID, "obligation", "")).toEqual([]);
      expect(await findingsByType(VALID_DOC_ID, "obligation", "   ")).toEqual([]);
    });

    it("findingWithEvidence returns null for invalid findingId or userId", async () => {
      expect(await findingWithEvidence("not-a-uuid", OWNER_USER_ID)).toBeNull();
      expect(await findingWithEvidence("", OWNER_USER_ID)).toBeNull();
      expect(await findingWithEvidence("   ", OWNER_USER_ID)).toBeNull();
      expect(await findingWithEvidence(FINDING_ID_1, "")).toBeNull();
      expect(await findingWithEvidence(FINDING_ID_1, "   ")).toBeNull();
      // @ts-expect-error Testing null handling
      expect(await findingWithEvidence(null, OWNER_USER_ID)).toBeNull();
    });
  });

  // =========================================================================
  // 5. Database Error Masking & Safety
  // =========================================================================
  describe("5. Error Masking & Credentials Protection", () => {
    it("findingsByDocument catches unexpected database errors and re-throws safe DatabaseError", async () => {
      shouldFailDb = true;

      await expect(findingsByDocument(VALID_DOC_ID, OWNER_USER_ID)).rejects.toThrow(
        DatabaseError
      );

      try {
        await findingsByDocument(VALID_DOC_ID, OWNER_USER_ID);
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        const message = (err as Error).message;
        expect(message).not.toContain("super_secret");
        expect(message).not.toContain("postgres://");
        expect(message).not.toContain("db.internal");
      }
    });

    it("findingsByType catches unexpected database errors and re-throws safe DatabaseError", async () => {
      shouldFailDb = true;

      await expect(
        findingsByType(VALID_DOC_ID, "obligation", OWNER_USER_ID)
      ).rejects.toThrow(DatabaseError);

      try {
        await findingsByType(VALID_DOC_ID, "obligation", OWNER_USER_ID);
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        const message = (err as Error).message;
        expect(message).not.toContain("super_secret");
        expect(message).not.toContain("postgres://");
      }
    });

    it("findingWithEvidence catches unexpected database errors and re-throws safe DatabaseError", async () => {
      shouldFailDb = true;

      await expect(
        findingWithEvidence(FINDING_ID_1, OWNER_USER_ID)
      ).rejects.toThrow(DatabaseError);

      try {
        await findingWithEvidence(FINDING_ID_1, OWNER_USER_ID);
      } catch (err) {
        expect(err).toBeInstanceOf(DatabaseError);
        const message = (err as Error).message;
        expect(message).not.toContain("super_secret");
        expect(message).not.toContain("postgres://");
      }
    });
  });
});


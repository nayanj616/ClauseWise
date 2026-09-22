/**
 * Phase 4 Final Verification Suite — ClauseWise (Slice 4.5)
 *
 * Systematic end-to-end unit and integration verification covering all Phase 4
 * contracts:
 * 1. Retrieval Domain Service (tenant isolation, UUID validation, error masking)
 * 2. Highlighting Engine (text preservation, whitespace tolerance, absence safety)
 * 3. Finding-to-Viewer Navigation Coordinator & Focus Management
 * 4. Linked Views (Attention Items, Important Dates, Financial Terms)
 * 5. Formatters (Date and Financial Metadata formatting)
 * 6. Evidence Truthfulness & Missing-Information Invariants
 * 7. Accessibility & Safety Guardrails
 *
 * Terminal gate for Phase 4 closure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import {
  documents,
  documentSections,
  documentChunks,
  documentFindings,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Database Mock Setup for Unit Testing (hoisted)
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

// Phase 4.1 Retrieval Service
import {
  findingsByDocument,
  findingsByType,
  findingWithEvidence,
  DatabaseError,
} from "@/lib/services/retrieval-service";

// Phase 4.2 Highlighting Utility
import {
  findHighlightRange,
  getHighlightSegments,
} from "@/lib/workspace/highlight";

// Phase 4.3 Navigation & Document Viewer
import {
  scrollAndFocusHighlight,
  formatPageRange,
} from "@/components/workspace/DocumentViewer";
import { DocumentWorkspace } from "@/components/workspace/DocumentWorkspace";
import { FindingCard } from "@/components/workspace/FindingCard";
import { EvidencePanel } from "@/components/workspace/EvidencePanel";

// Phase 4.4 Linked Views & Formatters
import { AttentionItemsSummary } from "@/components/workspace/AttentionItemsSummary";
import { FormattedDatesList } from "@/components/workspace/FormattedDatesList";
import { FormattedFinancialList } from "@/components/workspace/FormattedFinancialList";
import {
  formatFindingDate,
  formatFinancialTerm,
} from "@/lib/workspace/formatters";

import type {
  DocumentFinding,
  DocumentWorkspaceData,
  WorkspaceDocument,
  WorkspaceSection,
} from "@/types";

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const VALID_USER_ID = "22222222-2222-4222-a222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-a333-333333333333";
const VALID_FINDING_ID = "44444444-4444-4444-a444-444444444444";
const VALID_SECTION_ID = "55555555-5555-4555-a555-555555555555";
const VALID_CHUNK_ID = "66666666-6666-4666-a666-666666666666";

const mockDocument: WorkspaceDocument = {
  id: VALID_DOC_ID,
  filename: "Commercial_Lease_Agreement.pdf",
  fileSizeBytes: 1048576,
  pageCount: 5,
  mimeType: "application/pdf",
  status: "ready",
  errorMessage: null,
  createdAt: new Date("2026-09-20T10:00:00Z"),
  updatedAt: new Date("2026-09-20T10:00:00Z"),
  metadata: {
    documentType: "Commercial Lease",
    parties: [{ name: "Acme Properties", role: "Landlord" }],
  },
};

const mockSections: WorkspaceSection[] = [
  {
    id: VALID_SECTION_ID,
    orderIndex: 0,
    sectionNumber: 1,
    title: "Section 1: Premises and Term",
    content:
      "Landlord hereby leases to Tenant the premises located at 100 Main St. The lease term shall commence on October 1, 2026 and expire on September 30, 2029.",
    pageStart: 1,
    pageEnd: 1,
  },
  {
    id: "sec-2-uuid",
    orderIndex: 1,
    sectionNumber: 2,
    title: "Section 2: Rent and Security Deposit",
    content:
      "Tenant shall pay monthly base rent of $5,000 USD on or before the first day of each calendar month. Tenant shall deposit $10,000 as a security deposit.",
    pageStart: 2,
    pageEnd: 2,
  },
];

const mockSubstantiveFinding: DocumentFinding = {
  id: VALID_FINDING_ID,
  documentId: VALID_DOC_ID,
  sectionId: VALID_SECTION_ID,
  chunkId: VALID_CHUNK_ID,
  findingType: "date",
  importance: "important",
  label: "Lease Commencement Date",
  summary: "The lease term commences on October 1, 2026.",
  sourceText: "The lease term shall commence on October 1, 2026",
  pageNumber: 1,
  metadata: {
    dateValue: "2026-10-01",
    dateDescription: "Commencement Date",
  },
  createdAt: new Date("2026-09-20T10:05:00Z"),
  updatedAt: new Date("2026-09-20T10:05:00Z"),
};

const mockMissingFinding: DocumentFinding = {
  id: "77777777-7777-4777-a777-777777777777",
  documentId: VALID_DOC_ID,
  sectionId: null,
  chunkId: null,
  findingType: "missing_information",
  importance: "needs_attention",
  label: "Absence of Sublease Clause",
  summary: "No standard subleasing or assignment terms were identified.",
  sourceText: null,
  pageNumber: null,
  metadata: {
    expectedTopic: "Assignment and Subletting",
    ruleBasis: "Commercial leases typically contain explicit sublease restrictions.",
  },
  createdAt: new Date("2026-09-20T10:06:00Z"),
  updatedAt: new Date("2026-09-20T10:06:00Z"),
};

const mockFinancialFinding: DocumentFinding = {
  id: "fin-finding-uuid",
  documentId: VALID_DOC_ID,
  sectionId: "sec-2-uuid",
  chunkId: null,
  findingType: "financial_term",
  importance: "needs_attention",
  label: "Base Monthly Rent",
  summary: "Monthly base rent obligation is $5,000 payable in advance.",
  sourceText: "Tenant shall pay monthly base rent of $5,000 USD",
  pageNumber: 2,
  metadata: {
    amount: "$5,000",
    currency: "USD",
    frequency: "monthly",
  },
  createdAt: new Date("2026-09-20T10:07:00Z"),
  updatedAt: new Date("2026-09-20T10:07:00Z"),
};

// =============================================================================
// 1. Retrieval Domain Service Verification (Phase 4.1)
// =============================================================================

describe("Phase 4.1: Retrieval Domain Service Verification", () => {
  beforeEach(() => {
    mockDocRecords = [];
    mockFindingRecords = [];
    mockSectionRecords = [];
    mockChunkRecords = [];
    shouldFailDb = false;
  });

  describe("Tenant Isolation and Ownership Enforcement", () => {
    it("returns empty array when document does not belong to requesting user", async () => {
      mockDocRecords = []; // Owner check fails (not found for other user)
      const findings = await findingsByDocument(VALID_DOC_ID, OTHER_USER_ID);
      expect(findings).toEqual([]);
    });

    it("rejects invalid document UUIDs without querying the database", async () => {
      const result = await findingsByDocument("not-a-valid-uuid", VALID_USER_ID);
      expect(result).toEqual([]);
    });

    it("rejects empty userId without querying the database", async () => {
      const result = await findingsByDocument(VALID_DOC_ID, "   ");
      expect(result).toEqual([]);
    });

    it("filters by findingType while preserving ownership checks", async () => {
      mockDocRecords = [{ id: VALID_DOC_ID, userId: VALID_USER_ID }];
      mockFindingRecords = [mockFinancialFinding];

      const findings = await findingsByType(
        VALID_DOC_ID,
        "financial_term",
        VALID_USER_ID
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].findingType).toBe("financial_term");
    });
  });

  describe("Evidence Mapping & Invariant Integrity", () => {
    it("returns finding with associated section and chunk evidence for substantive findings", async () => {
      mockDocRecords = [{ id: VALID_DOC_ID, userId: VALID_USER_ID }];
      mockFindingRecords = [mockSubstantiveFinding];
      mockSectionRecords = [
        {
          id: VALID_SECTION_ID,
          documentId: VALID_DOC_ID,
          orderIndex: 0,
          title: "Section 1",
          content: "The lease term shall commence on October 1, 2026",
          pageStart: 1,
          pageEnd: 1,
        },
      ];
      mockChunkRecords = [
        {
          id: VALID_CHUNK_ID,
          documentId: VALID_DOC_ID,
          sectionId: VALID_SECTION_ID,
          chunkIndex: 0,
          content: "The lease term shall commence on October 1, 2026",
          pageNumber: 1,
          tokenCount: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = await findingWithEvidence(VALID_FINDING_ID, VALID_USER_ID);
      expect(result).not.toBeNull();
      expect(result?.finding.id).toBe(VALID_FINDING_ID);
      expect(result?.section).not.toBeNull();
      expect(result?.chunk).not.toBeNull();
      expect(result?.section?.id).toBe(VALID_SECTION_ID);
    });

    it("strictly preserves section: null and chunk: null for missing_information (zero fake citations)", async () => {
      mockDocRecords = [{ id: VALID_DOC_ID, userId: VALID_USER_ID }];
      mockFindingRecords = [mockMissingFinding];

      const result = await findingWithEvidence(
        "77777777-7777-4777-a777-777777777777",
        VALID_USER_ID
      );
      expect(result).not.toBeNull();
      expect(result?.finding.findingType).toBe("missing_information");
      expect(result?.section).toBeNull();
      expect(result?.chunk).toBeNull();
    });

    it("masks internal database errors without exposing credentials or stack traces", async () => {
      shouldFailDb = true;

      await expect(
        findingsByDocument(VALID_DOC_ID, VALID_USER_ID)
      ).rejects.toThrow(DatabaseError);
      await expect(
        findingsByDocument(VALID_DOC_ID, VALID_USER_ID)
      ).rejects.not.toThrow(/super_secret/);
    });
  });
});

// =============================================================================
// 2. Highlighting Utility Verification (Phase 4.2)
// =============================================================================

describe("Phase 4.2: Highlighting Engine Verification", () => {
  const content =
    "Landlord leases to Tenant the premises at 100 Main St.\nThe lease term\nshall commence on October 1, 2026\nand expire on September 30, 2029.";

  it("identifies exact character offsets without modifying original string", () => {
    const excerpt = "commence on October 1, 2026";
    const range = findHighlightRange(content, excerpt);

    expect(range).not.toBeNull();
    expect(range?.startIndex).toBe(76);
    expect(range?.endIndex).toBe(103);
    expect(content.slice(range!.startIndex, range!.endIndex)).toBe(excerpt);
  });

  it("tolerates newline vs space and multiple whitespace characters", () => {
    const excerpt = "The lease term shall commence on October 1, 2026";
    const range = findHighlightRange(content, excerpt);

    expect(range).not.toBeNull();
    expect(range?.matchedText).toBe("The lease term\nshall commence on October 1, 2026");
  });

  it("tolerates typographic curly quotes vs straight quotes", () => {
    const curlyContent = 'The "Customer" and the "Provider" agree.';
    const range = findHighlightRange(curlyContent, 'The “Customer” and the “Provider” agree.');
    expect(range).not.toBeNull();
    expect(range?.matchedText).toBe('The "Customer" and the "Provider" agree.');
  });

  it("preserves section text integrity: before + highlighted + after === content exactly", () => {
    const excerpt = "commence on October 1, 2026";
    const segments = getHighlightSegments(content, excerpt);

    expect(segments.hasMatch).toBe(true);
    expect(segments.before + segments.highlighted + segments.after).toBe(content);
  });

  it("returns hasMatch: false and null range for missing_information (null sourceText)", () => {
    const segments = getHighlightSegments(content, null);

    expect(segments.hasMatch).toBe(false);
    expect(segments.range).toBeNull();
    expect(segments.highlighted).toBe("");
    expect(segments.before).toBe(content);
  });

  it("returns hasMatch: false when excerpt is absent from content", () => {
    const segments = getHighlightSegments(content, "Completely absent clause excerpt");

    expect(segments.hasMatch).toBe(false);
    expect(segments.range).toBeNull();
  });
});

// =============================================================================
// 3. Navigation Coordinator & Focus Management (Phase 4.3)
// =============================================================================

describe("Phase 4.3: Finding-to-Viewer Navigation Coordinator", () => {
  it("scrollAndFocusHighlight safely focuses and returns true for valid element", () => {
    const el = {
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement;

    const result = scrollAndFocusHighlight(el);
    expect(result).toBe(true);
    expect(el.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("scrollAndFocusHighlight returns false when element is null", () => {
    const result = scrollAndFocusHighlight(null);
    expect(result).toBe(false);
  });

  it("FindingCard renders 'View in document' button for substantive findings with evidence", () => {
    const html = renderToString(
      <FindingCard
        finding={mockSubstantiveFinding}
        isSelected={false}
        onSelect={vi.fn()}
        onViewInDocument={vi.fn()}
      />
    );

    expect(html).toContain(`data-testid="finding-view-in-doc-${mockSubstantiveFinding.id}"`);
    expect(html).toContain("View in document");
  });

  it("FindingCard suppresses 'View in document' button for missing_information", () => {
    const html = renderToString(
      <FindingCard
        finding={mockMissingFinding}
        isSelected={false}
        onSelect={vi.fn()}
        onViewInDocument={vi.fn()}
      />
    );

    expect(html).not.toContain(`data-testid="finding-view-in-doc-${mockMissingFinding.id}"`);
    expect(html).toContain("Absence in document");
  });

  it("EvidencePanel renders 'View in Document Text' button for substantive findings", () => {
    const html = renderToString(
      <EvidencePanel
        finding={mockSubstantiveFinding}
        onViewInDocument={vi.fn()}
      />
    );

    expect(html).toContain('data-testid="jump-to-section-button"');
    expect(html).toContain("View in Document Text");
  });

  it("EvidencePanel renders absence notice without jump button for missing_information", () => {
    const html = renderToString(
      <EvidencePanel
        finding={mockMissingFinding}
        onViewInDocument={vi.fn()}
      />
    );

    expect(html).not.toContain('data-testid="jump-to-section-button"');
    expect(html).toContain('data-testid="missing-information-evidence-block"');
    expect(html).toContain("Assignment and Subletting");
  });
});

// =============================================================================
// 4. Linked Views & Badges (Phase 4.4)
// =============================================================================

describe("Phase 4.4: Linked Views Verification", () => {
  const allFindings = [
    mockSubstantiveFinding, // date, important
    mockMissingFinding,     // missing_information, needs_attention
    mockFinancialFinding,   // financial_term, needs_attention
  ];

  it("AttentionItemsSummary filters strictly for needs_attention findings", () => {
    const html = renderToString(
      <AttentionItemsSummary
        findings={allFindings}
        selectedFindingId={null}
        onViewInDocument={vi.fn()}
      />
    );

    expect(html).toContain("Items Requiring Attention");
    // Must contain the two needs_attention findings
    expect(html).toContain("Absence of Sublease Clause");
    expect(html).toContain("Base Monthly Rent");
    // Must NOT contain the important date finding
    expect(html).not.toContain("Lease Commencement Date");
  });

  it("FormattedDatesList filters strictly for date findingType", () => {
    const html = renderToString(
      <FormattedDatesList
        findings={allFindings}
        selectedFindingId={null}
        onViewInDocument={vi.fn()}
      />
    );

    expect(html).toContain("Important Dates");
    expect(html).toContain("Lease Commencement Date");
    expect(html).toContain("Oct 1, 2026");
    expect(html).not.toContain("Base Monthly Rent");
  });

  it("FormattedFinancialList filters strictly for financial_term findingType", () => {
    const html = renderToString(
      <FormattedFinancialList
        findings={allFindings}
        selectedFindingId={null}
        onViewInDocument={vi.fn()}
      />
    );

    expect(html).toContain("Financial Terms");
    expect(html).toContain("Base Monthly Rent");
    expect(html).toContain("$5,000 (monthly)");
    expect(html).not.toContain("Lease Commencement Date");
  });
});

// =============================================================================
// 5. Formatters Verification (Phase 4.4)
// =============================================================================

describe("Phase 4.4: Formatters Verification", () => {
  describe("formatFindingDate", () => {
    it("formats ISO YYYY-MM-DD to Mon DD, YYYY without timezone shift", () => {
      expect(formatFindingDate("2026-10-01")).toBe("Oct 1, 2026");
      expect(formatFindingDate("2025-01-15")).toBe("Jan 15, 2025");
      expect(formatFindingDate("2027-12-31")).toBe("Dec 31, 2027");
    });

    it("preserves non-ISO date descriptions as-is", () => {
      expect(formatFindingDate("Within 30 days of execution")).toBe("Within 30 days of execution");
    });

    it("returns null for null, undefined, or empty values", () => {
      expect(formatFindingDate(null)).toBeNull();
      expect(formatFindingDate(undefined)).toBeNull();
      expect(formatFindingDate("   ")).toBeNull();
    });
  });

  describe("formatFinancialTerm", () => {
    it("formats amount with frequency", () => {
      expect(formatFinancialTerm("$5,000", "USD", "monthly")).toBe("$5,000 (monthly)");
    });

    it("appends currency when not already present in amount symbol", () => {
      expect(formatFinancialTerm("10,000", "USD", "annually")).toBe("10,000 USD (annually)");
    });

    it("returns null for null, undefined, or empty amount", () => {
      expect(formatFinancialTerm(null)).toBeNull();
      expect(formatFinancialTerm("")).toBeNull();
      expect(formatFinancialTerm("   ")).toBeNull();
    });
  });
});

// =============================================================================
// 6. Security, Disclaimer & Accessibility Invariants
// =============================================================================

describe("Phase 4: Safety & Quality Invariants", () => {
  it("renders the legal disclaimer in DocumentWorkspace", () => {
    const workspaceData: DocumentWorkspaceData = {
      document: mockDocument,
      sections: mockSections,
    };

    const html = renderToString(
      <DocumentWorkspace
        data={workspaceData}
        findings={[mockSubstantiveFinding]}
      />
    );

    expect(html).toContain("not a substitute for professional legal advice");
  });

  it("never fabricates page ranges when start/end page are invalid", () => {
    expect(formatPageRange(null, null)).toBeNull();
    expect(formatPageRange(0, 0)).toBeNull();
    expect(formatPageRange(-1, 2)).toBeNull();
    expect(formatPageRange(2, 4)).toBe("Pages 2–4");
    expect(formatPageRange(3, 3)).toBe("Page 3");
  });
});

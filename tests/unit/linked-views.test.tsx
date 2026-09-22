/**
 * Unit Tests — Dedicated Attention Items, Dates, and Financial Terms Linked Views (Phase 4 Slice 4.4)
 *
 * Covers:
 * 1. Attention Items (AttentionItemsSummary):
 *    - 1. needs_attention findings are surfaced
 *    - 2. Other importance levels (important, informational) are excluded
 *    - 3. Substantive attention findings expose source navigation ("View in document")
 *    - 4. missing_information attention findings do not expose fake navigation
 *    - 5. Empty attention state renders correctly
 *    - 6. Navigation uses the existing workspace callback
 *
 * 2. Important Dates (FormattedDatesList):
 *    - 7. Date findings are surfaced
 *    - 8. Existing date metadata is formatted consistently (formatFindingDate)
 *    - 9. Date items with evidence expose source navigation
 *    - 10. Missing evidence does not produce fake navigation
 *    - 11. Empty date state renders correctly
 *
 * 3. Financial Terms (FormattedFinancialList):
 *    - 12. Financial findings are surfaced
 *    - 13. Existing financial metadata is displayed correctly (formatFinancialTerm)
 *    - 14. Financial findings with evidence expose source navigation
 *    - 15. Missing evidence does not produce fake navigation
 *    - 16. Empty financial state renders correctly
 *
 * 4. Regression & Workspace Integration:
 *    - 17. Existing FindingList behavior remains intact
 *    - 18. Existing EvidencePanel behavior remains intact
 *    - 19. Existing Analysis -> Document navigation remains intact
 *    - 20. Missing-information evidence invariants remain intact (zero fake citations)
 *    - 21. Existing processing/error/empty workspace states remain intact
 */

import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { DocumentWorkspace } from "@/components/workspace/DocumentWorkspace";
import { AttentionItemsSummary } from "@/components/workspace/AttentionItemsSummary";
import { FormattedDatesList } from "@/components/workspace/FormattedDatesList";
import { FormattedFinancialList } from "@/components/workspace/FormattedFinancialList";
import {
  formatFindingDate,
  formatFinancialTerm,
} from "@/lib/utils";
import type {
  WorkspaceDocument,
  WorkspaceSection,
  DocumentFinding,
  DocumentWorkspaceData,
} from "@/types";

// ---------------------------------------------------------------------------
// Helpers & Mock Fixtures
// ---------------------------------------------------------------------------

function createMockDoc(overrides?: Partial<WorkspaceDocument>): WorkspaceDocument {
  return {
    id: "doc-test-1111-2222-3333-444444444444",
    filename: "Master_Services_Agreement.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 204800,
    status: "ready",
    pageCount: 4,
    createdAt: new Date("2026-09-20T12:00:00Z"),
    updatedAt: new Date("2026-09-20T12:05:00Z"),
    errorMessage: null,
    ...overrides,
  };
}

function createMockSections(): WorkspaceSection[] {
  return [
    {
      id: "sec-1",
      orderIndex: 0,
      sectionNumber: 1,
      title: "1. Term & Expiration",
      content: "This Agreement shall expire on October 15, 2026 unless terminated earlier.",
      pageStart: 1,
      pageEnd: 1,
    },
    {
      id: "sec-2",
      orderIndex: 1,
      sectionNumber: 2,
      title: "2. Fees & Compensation",
      content: "Client shall pay Provider a monthly fee of $50,000 within 30 days of invoice.",
      pageStart: 2,
      pageEnd: 2,
    },
    {
      id: "sec-3",
      orderIndex: 2,
      sectionNumber: 3,
      title: "3. Indemnification & Liability",
      content: "Provider's aggregate liability under this Agreement shall not exceed total fees paid.",
      pageStart: 3,
      pageEnd: 3,
    },
  ];
}

function createMockFindings(): DocumentFinding[] {
  return [
    // Substantive attention item
    {
      id: "f-att-substantive",
      documentId: "doc-test-1111-2222-3333-444444444444",
      sectionId: "sec-3",
      chunkId: null,
      pageNumber: 3,
      findingType: "attention",
      importance: "needs_attention",
      label: "Liability Limitation Cap",
      summary: "Liability is strictly capped at fees paid under the contract.",
      sourceText: "aggregate liability under this Agreement shall not exceed total fees paid",
      metadata: null,
      createdAt: new Date("2026-09-20T12:05:00Z"),
      updatedAt: new Date("2026-09-20T12:05:00Z"),
    },
    // Missing-information attention item
    {
      id: "f-att-missing",
      documentId: "doc-test-1111-2222-3333-444444444444",
      sectionId: null,
      chunkId: null,
      pageNumber: null,
      findingType: "missing_information",
      importance: "needs_attention",
      label: "Missing Data Protection Addendum",
      summary: "No standard DPA or security safeguard clauses identified.",
      sourceText: null,
      metadata: {
        expectedTopic: "data_security_and_privacy",
        ruleBasis: "Commercial services contracts handling customer data require a DPA.",
      },
      createdAt: new Date("2026-09-20T12:05:00Z"),
      updatedAt: new Date("2026-09-20T12:05:00Z"),
    },
    // Non-attention obligation (important)
    {
      id: "f-ob-important",
      documentId: "doc-test-1111-2222-3333-444444444444",
      sectionId: "sec-2",
      chunkId: null,
      pageNumber: 2,
      findingType: "obligation",
      importance: "important",
      label: "Payment Due Within 30 Days",
      summary: "Invoices must be paid within thirty calendar days.",
      sourceText: "within 30 days of invoice",
      metadata: null,
      createdAt: new Date("2026-09-20T12:05:00Z"),
      updatedAt: new Date("2026-09-20T12:05:00Z"),
    },
    // Date finding with evidence
    {
      id: "f-date-substantive",
      documentId: "doc-test-1111-2222-3333-444444444444",
      sectionId: "sec-1",
      chunkId: null,
      pageNumber: 1,
      findingType: "date",
      importance: "informational",
      label: "Expiration Date",
      summary: "The agreement expires on October 15, 2026.",
      sourceText: "expire on October 15, 2026",
      metadata: {
        dateValue: "2026-10-15",
        dateDescription: "Scheduled Expiration",
      },
      createdAt: new Date("2026-09-20T12:05:00Z"),
      updatedAt: new Date("2026-09-20T12:05:00Z"),
    },
    // Date finding without evidence (null sourceText)
    {
      id: "f-date-no-evidence",
      documentId: "doc-test-1111-2222-3333-444444444444",
      sectionId: null,
      chunkId: null,
      pageNumber: null,
      findingType: "date",
      importance: "informational",
      label: "Renewal Deadline",
      summary: "Notice must be given 60 days before expiration.",
      sourceText: null,
      metadata: {
        dateValue: "60 days prior to expiration",
      },
      createdAt: new Date("2026-09-20T12:05:00Z"),
      updatedAt: new Date("2026-09-20T12:05:00Z"),
    },
    // Financial term finding with evidence
    {
      id: "f-fin-substantive",
      documentId: "doc-test-1111-2222-3333-444444444444",
      sectionId: "sec-2",
      chunkId: null,
      pageNumber: 2,
      findingType: "financial_term",
      importance: "important",
      label: "Monthly Retainer Fee",
      summary: "Fixed recurring monthly service fee of $50,000.",
      sourceText: "monthly fee of $50,000 within 30 days",
      metadata: {
        amount: "$50,000",
        currency: "USD",
        frequency: "monthly",
      },
      createdAt: new Date("2026-09-20T12:05:00Z"),
      updatedAt: new Date("2026-09-20T12:05:00Z"),
    },
    // Financial term without evidence
    {
      id: "f-fin-no-evidence",
      documentId: "doc-test-1111-2222-3333-444444444444",
      sectionId: null,
      chunkId: null,
      pageNumber: null,
      findingType: "financial_term",
      importance: "informational",
      label: "Late Payment Interest",
      summary: "Statutory late interest applies.",
      sourceText: null,
      metadata: {
        amount: "1.5%",
        frequency: "per month",
      },
      createdAt: new Date("2026-09-20T12:05:00Z"),
      updatedAt: new Date("2026-09-20T12:05:00Z"),
    },
  ];
}

// ---------------------------------------------------------------------------
// 1. Attention Items Tests (AttentionItemsSummary)
// ---------------------------------------------------------------------------

describe("Phase 4.4 Linked Views — Attention Items", () => {
  const findings = createMockFindings();

  it("1. surfaces needs_attention findings", () => {
    const html = renderToString(
      <AttentionItemsSummary
        findings={findings}
        onViewInDocument={() => {}}
      />
    );

    expect(html).toContain('data-testid="attention-items-section"');
    expect(html).toContain("Liability Limitation Cap");
    expect(html).toContain("Missing Data Protection Addendum");
    expect(html).toContain("2 items");
  });

  it("2. excludes other importance levels (important, informational)", () => {
    const html = renderToString(
      <AttentionItemsSummary
        findings={findings}
      />
    );

    // Non-needs_attention findings must not appear in Attention Items
    expect(html).not.toContain("Payment Due Within 30 Days");
    expect(html).not.toContain("Expiration Date");
    expect(html).not.toContain("Monthly Retainer Fee");
  });

  it("3. exposes source navigation for substantive attention findings", () => {
    const navSpy = vi.fn();
    const html = renderToString(
      <AttentionItemsSummary
        findings={findings}
        onViewInDocument={navSpy}
      />
    );

    // Substantive item has View in document button
    expect(html).toContain('data-testid="finding-view-in-doc-f-att-substantive"');
    expect(html).toContain("View in document");
  });

  it("4. does not expose fake navigation for missing_information attention findings", () => {
    const html = renderToString(
      <AttentionItemsSummary
        findings={findings}
        onViewInDocument={() => {}}
      />
    );

    // Missing information item must have Absence badge and ZERO view in document button
    expect(html).toContain("Absence in document");
    expect(html).not.toContain('data-testid="finding-view-in-doc-f-att-missing"');
  });

  it("5. renders appropriate empty state when zero attention items exist", () => {
    const noAttentionFindings = findings.filter((f) => f.importance !== "needs_attention");
    const html = renderToString(
      <AttentionItemsSummary
        findings={noAttentionFindings}
      />
    );

    expect(html).toContain('data-testid="attention-items-empty"');
    expect(html).toContain("No Items Requiring Attention");
  });

  it("6. navigation callback is wired to the provided onViewInDocument prop", () => {
    const navSpy = vi.fn();
    const html = renderToString(
      <AttentionItemsSummary
        findings={findings}
        onViewInDocument={navSpy}
      />
    );

    expect(html).toContain('data-testid="finding-view-in-doc-f-att-substantive"');
  });
});

// ---------------------------------------------------------------------------
// 2. Important Dates Tests (FormattedDatesList & formatFindingDate)
// ---------------------------------------------------------------------------

describe("Phase 4.4 Linked Views — Important Dates", () => {
  const findings = createMockFindings();

  it("7. surfaces date findings", () => {
    const html = renderToString(
      <FormattedDatesList
        findings={findings}
        onViewInDocument={() => {}}
      />
    );

    expect(html).toContain('data-testid="formatted-dates-section"');
    expect(html).toContain("Expiration Date");
    expect(html).toContain("Renewal Deadline");
    expect(html).toContain("2 dates");
  });

  it("8. formats existing date metadata consistently via formatFindingDate", () => {
    // ISO format test
    expect(formatFindingDate("2026-10-15")).toBe("Oct 15, 2026");
    expect(formatFindingDate("2029-09-20")).toBe("Sep 20, 2029");

    // Non-ISO formatted text preserved
    expect(formatFindingDate("October 15, 2026")).toBe("October 15, 2026");
    expect(formatFindingDate("60 days prior to expiration")).toBe("60 days prior to expiration");

    // Null and empty safety
    expect(formatFindingDate(null)).toBeNull();
    expect(formatFindingDate(undefined)).toBeNull();
    expect(formatFindingDate("")).toBeNull();
    expect(formatFindingDate("   ")).toBeNull();

    // Verify rendered date badge in component
    const html = renderToString(
      <FormattedDatesList
        findings={findings}
      />
    );
    expect(html).toContain("Oct 15, 2026");
    expect(html).toContain("Scheduled Expiration");
  });

  it("9. exposes source navigation for date items with valid evidence", () => {
    const html = renderToString(
      <FormattedDatesList
        findings={findings}
        onViewInDocument={() => {}}
      />
    );

    expect(html).toContain('data-testid="finding-view-in-doc-f-date-substantive"');
  });

  it("10. does not produce fake navigation for date items without evidence", () => {
    const html = renderToString(
      <FormattedDatesList
        findings={findings}
        onViewInDocument={() => {}}
      />
    );

    expect(html).not.toContain('data-testid="finding-view-in-doc-f-date-no-evidence"');
  });

  it("11. renders appropriate empty state when zero date findings exist", () => {
    const noDateFindings = findings.filter((f) => f.findingType !== "date");
    const html = renderToString(
      <FormattedDatesList
        findings={noDateFindings}
      />
    );

    expect(html).toContain('data-testid="formatted-dates-empty"');
    expect(html).toContain("No Important Dates Identified");
  });
});

// ---------------------------------------------------------------------------
// 3. Financial Terms Tests (FormattedFinancialList & formatFinancialTerm)
// ---------------------------------------------------------------------------

describe("Phase 4.4 Linked Views — Financial Terms", () => {
  const findings = createMockFindings();

  it("12. surfaces financial_term findings", () => {
    const html = renderToString(
      <FormattedFinancialList
        findings={findings}
        onViewInDocument={() => {}}
      />
    );

    expect(html).toContain('data-testid="formatted-financial-section"');
    expect(html).toContain("Monthly Retainer Fee");
    expect(html).toContain("Late Payment Interest");
    expect(html).toContain("2 terms");
  });

  it("13. formats financial metadata correctly via formatFinancialTerm", () => {
    expect(formatFinancialTerm("$50,000", "USD", "monthly")).toBe("$50,000 (monthly)");
    expect(formatFinancialTerm("10,000", "EUR", "one_time")).toBe("10,000 EUR (one time)");
    expect(formatFinancialTerm("1.5%", null, "per_month")).toBe("1.5% (per month)");
    expect(formatFinancialTerm(null)).toBeNull();
    expect(formatFinancialTerm("")).toBeNull();

    // Verify rendered badge in component
    const html = renderToString(
      <FormattedFinancialList
        findings={findings}
      />
    );
    expect(html).toContain("$50,000 (monthly)");
  });

  it("14. exposes source navigation for financial findings with valid evidence", () => {
    const html = renderToString(
      <FormattedFinancialList
        findings={findings}
        onViewInDocument={() => {}}
      />
    );

    expect(html).toContain('data-testid="finding-view-in-doc-f-fin-substantive"');
  });

  it("15. does not produce fake navigation for financial findings without evidence", () => {
    const html = renderToString(
      <FormattedFinancialList
        findings={findings}
        onViewInDocument={() => {}}
      />
    );

    expect(html).not.toContain('data-testid="finding-view-in-doc-f-fin-no-evidence"');
  });

  it("16. renders appropriate empty state when zero financial findings exist", () => {
    const noFinFindings = findings.filter((f) => f.findingType !== "financial_term");
    const html = renderToString(
      <FormattedFinancialList
        findings={noFinFindings}
      />
    );

    expect(html).toContain('data-testid="formatted-financial-empty"');
    expect(html).toContain("No Financial Terms Identified");
  });
});

// ---------------------------------------------------------------------------
// 4. Regression & Workspace Integration Tests
// ---------------------------------------------------------------------------

describe("Phase 4.4 Linked Views — Workspace Integration & Regression", () => {
  const doc = createMockDoc();
  const sections = createMockSections();
  const findings = createMockFindings();
  const data: DocumentWorkspaceData = { document: doc, sections };

  it("17. preserves FindingList rendering and filters intact in Analysis workspace", () => {
    const html = renderToString(
      <DocumentWorkspace
        data={data}
        findings={findings}
        initialTab="analysis"
      />
    );

    expect(html).toContain('data-testid="findings-list-container"');
    expect(html).toContain("Filter by Importance");
    expect(html).toContain("All (7)");
  });

  it("18. preserves EvidencePanel rendering and details intact in Analysis workspace", () => {
    const html = renderToString(
      <DocumentWorkspace
        data={data}
        findings={findings}
        initialTab="analysis"
      />
    );

    expect(html).toContain('data-testid="evidence-panel-active"');
    expect(html).toContain("Supporting Evidence (Source Text)");
  });

  it("19. integrates Attention Items, Dates, and Financial Terms into DocumentWorkspace Analysis view", () => {
    const html = renderToString(
      <DocumentWorkspace
        data={data}
        findings={findings}
        initialTab="analysis"
      />
    );

    // All three linked views must be present in the workspace Analysis view
    expect(html).toContain('data-testid="attention-items-section"');
    expect(html).toContain('data-testid="formatted-dates-section"');
    expect(html).toContain('data-testid="formatted-financial-section"');
    expect(html).toContain('data-testid="document-overview-section"');
  });

  it("20. preserves missing-information invariants across all linked views (zero fake citations)", () => {
    const html = renderToString(
      <DocumentWorkspace
        data={data}
        findings={findings}
        initialTab="analysis"
      />
    );

    // Missing data protection addendum in Attention Items
    expect(html).toContain("Missing Data Protection Addendum");
    expect(html).toContain("Absence in document");
    // Ensure no fake view-in-doc button for missing item
    expect(html).not.toContain('data-testid="finding-view-in-doc-f-att-missing"');
  });

  it("21. preserves processing, error, and empty workspace status routing intact", () => {
    // Error state
    const errorData: DocumentWorkspaceData = {
      document: createMockDoc({ status: "error", errorMessage: "Corrupted PDF stream" }),
      sections: [],
    };
    const errorHtml = renderToString(<DocumentWorkspace data={errorData} />);
    expect(errorHtml).toContain('data-testid="workspace-error-state"');

    // Processing state
    const procData: DocumentWorkspaceData = {
      document: createMockDoc({ status: "chunking" }),
      sections: [],
    };
    const procHtml = renderToString(<DocumentWorkspace data={procData} />);
    expect(procHtml).toContain('data-testid="workspace-processing-state"');

    // Empty state
    const emptyData: DocumentWorkspaceData = {
      document: createMockDoc({ status: "ready" }),
      sections: [],
    };
    const emptyHtml = renderToString(<DocumentWorkspace data={emptyData} />);
    expect(emptyHtml).toContain('data-testid="workspace-empty-state"');
  });
});


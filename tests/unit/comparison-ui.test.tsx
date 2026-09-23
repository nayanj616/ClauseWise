import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { CompareDisclaimerBanner, CompareDisclaimerFooter } from "@/components/compare/CompareDisclaimerBanner";
import { DocumentSelectorPair } from "@/components/compare/DocumentSelectorPair";
import { ComparisonSummaryCard } from "@/components/compare/ComparisonSummaryCard";
import { MetadataDiffCard } from "@/components/compare/MetadataDiffCard";
import { DifferenceCard } from "@/components/compare/DifferenceCard";
import { DifferencesList } from "@/components/compare/DifferencesList";
import { ComparisonEmptyState } from "@/components/compare/ComparisonEmptyState";
import { ComparisonWorkspace } from "@/components/compare/ComparisonWorkspace";
import type {
  UserDocumentListItem,
  DocumentComparisonResult,
  SectionDifferenceItem,
} from "@/types";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

function renderHtml(element: React.ReactElement): string {
  return renderToString(element).replace(/<!-- -->/g, "");
}

const mockUserDocuments: UserDocumentListItem[] = [
  {
    id: "doc-1",
    title: "Master Services Agreement v1",
    originalFilename: "MSA_v1.pdf",
    status: "ready",
    documentType: "Master Services Agreement",
    pageCount: 3,
    createdAt: new Date("2026-09-20"),
  },
  {
    id: "doc-2",
    title: "Master Services Agreement v2",
    originalFilename: "MSA_v2.pdf",
    status: "ready",
    documentType: "Master Services Agreement",
    pageCount: 4,
    createdAt: new Date("2026-09-21"),
  },
  {
    id: "doc-3",
    title: "Draft NDA",
    originalFilename: "NDA.pdf",
    status: "extracting",
    documentType: "Non-Disclosure Agreement",
    pageCount: 2,
    createdAt: new Date("2026-09-22"),
  },
];

const mockDifferences: SectionDifferenceItem[] = [
  {
    id: "diff-mod-1",
    differenceType: "modified",
    title: "Section 1: Term and Termination (Modified)",
    description: "Wording differs between Document A (Section 1) and Document B (Section 1).",
    sectionAId: "sec-a1",
    sectionANumber: 1,
    sectionATitle: "Section 1: Term and Termination",
    sectionAPageStart: 1,
    sectionAPageEnd: 1,
    excerptA: "Agreement shall continue for a period of two (2) years.",
    findingAId: "finding-term-1",
    sectionBId: "sec-b1",
    sectionBNumber: 1,
    sectionBTitle: "Section 1: Term and Termination",
    sectionBPageStart: 1,
    sectionBPageEnd: 1,
    excerptB: "Agreement shall continue for a period of three (3) years.",
    findingBId: null,
    changeSummary: "Duration changed from 2 to 3 years",
  },
  {
    id: "diff-add-2",
    differenceType: "added",
    title: "Section 4: Non-Solicitation (Added in Document B)",
    description: "Provision present in Document B; no corresponding section exists in Document A.",
    sectionAId: null,
    sectionANumber: null,
    sectionATitle: null,
    sectionAPageStart: null,
    sectionAPageEnd: null,
    excerptA: null,
    findingAId: null,
    sectionBId: "sec-b4",
    sectionBNumber: 4,
    sectionBTitle: "Section 4: Non-Solicitation",
    sectionBPageStart: 4,
    sectionBPageEnd: 4,
    excerptB: "Recipient agrees not to solicit employees for 12 months.",
    findingBId: null,
    changeSummary: "New clause introduced in Document B.",
  },
  {
    id: "diff-rem-3",
    differenceType: "removed",
    title: "Section 3: Binding Arbitration (Removed in Document B)",
    description: "Provision present in Document A; omitted from Document B.",
    sectionAId: "sec-a3",
    sectionANumber: 3,
    sectionATitle: "Section 3: Binding Arbitration",
    sectionAPageStart: 3,
    sectionAPageEnd: 3,
    excerptA: "All disputes shall be settled by binding arbitration in Wilmington, Delaware.",
    findingAId: null,
    sectionBId: null,
    sectionBNumber: null,
    sectionBTitle: null,
    sectionBPageStart: null,
    sectionBPageEnd: null,
    excerptB: null,
    findingBId: null,
    changeSummary: "Clause omitted from Document B.",
  },
  {
    id: "diff-unc-4",
    differenceType: "unchanged",
    title: "Section 2: Confidentiality",
    description: "Content is textually identical across both documents.",
    sectionAId: "sec-a2",
    sectionANumber: 2,
    sectionATitle: "Section 2: Confidentiality",
    sectionAPageStart: 2,
    sectionAPageEnd: 2,
    excerptA: "Parties shall keep all proprietary materials strictly confidential.",
    findingAId: null,
    sectionBId: "sec-b2",
    sectionBNumber: 2,
    sectionBTitle: "Section 2: Confidentiality",
    sectionBPageStart: 2,
    sectionBPageEnd: 2,
    excerptB: "Parties shall keep all proprietary materials strictly confidential.",
    findingBId: null,
    changeSummary: "Identical wording in both documents.",
  },
];

const mockComparison: DocumentComparisonResult = {
  documentA: {
    id: "doc-1",
    title: "Master Services Agreement v1",
    filename: "MSA_v1.pdf",
    documentType: "Master Services Agreement",
    pageCount: 3,
    governingLaw: "State of New York",
    jurisdiction: "New York County",
    parties: [{ name: "Alpha Corp", role: "Customer" }, { name: "Omega LLC", role: "Provider" }],
  },
  documentB: {
    id: "doc-2",
    title: "Master Services Agreement v2",
    filename: "MSA_v2.pdf",
    documentType: "Master Services Agreement",
    pageCount: 4,
    governingLaw: "State of Delaware",
    jurisdiction: "Wilmington, Delaware",
    parties: [{ name: "Alpha Corp", role: "Customer" }, { name: "Omega LLC", role: "Provider" }],
  },
  metadataDifferences: [
    {
      field: "document_type",
      label: "Document Classification",
      valueA: "Master Services Agreement",
      valueB: "Master Services Agreement",
      isDifferent: false,
    },
    {
      field: "governing_law",
      label: "Governing Law",
      valueA: "State of New York",
      valueB: "State of Delaware",
      isDifferent: true,
    },
    {
      field: "jurisdiction",
      label: "Dispute Jurisdiction",
      valueA: "New York County",
      valueB: "Wilmington, Delaware",
      isDifferent: true,
    },
  ],
  differences: mockDifferences,
  summary: {
    totalDifferences: 3,
    addedCount: 1,
    removedCount: 1,
    modifiedCount: 1,
    unchangedCount: 1,
  },
  comparedAt: new Date("2026-09-23"),
};

describe("Compare UI Components", () => {
  it("renders CompareDisclaimerBanner and Footer with explicit non-lawyer copy", () => {
    const bannerHtml = renderHtml(<CompareDisclaimerBanner />);
    expect(bannerHtml).toContain("Objective Document Comparison");
    expect(bannerHtml).toContain("not legal advice");

    const footerHtml = renderHtml(<CompareDisclaimerFooter />);
    expect(footerHtml).toContain("No attorney-client relationship is formed");
  });

  it("renders DocumentSelectorPair with options, ready filter, and swap button", () => {
    const html = renderHtml(
      <DocumentSelectorPair
        userDocuments={mockUserDocuments}
        selectedDocAId="doc-1"
        selectedDocBId="doc-2"
        onSelectDocA={() => {}}
        onSelectDocB={() => {}}
        onSwap={() => {}}
      />
    );
    expect(html).toContain("data-testid=\"doc-a-select\"");
    expect(html).toContain("data-testid=\"doc-b-select\"");
    expect(html).toContain("data-testid=\"swap-docs-btn\"");
    expect(html).toContain("Master Services Agreement v1");
    expect(html).toContain("Master Services Agreement v2");
    // doc-3 is unready and should show status
    expect(html).toContain("[extracting]");
  });

  it("renders ComparisonSummaryCard with document profiles and counters", () => {
    const html = renderHtml(<ComparisonSummaryCard comparison={mockComparison} />);
    expect(html).toContain("Master Services Agreement v1");
    expect(html).toContain("Master Services Agreement v2");
    expect(html).toContain("data-testid=\"count-modified\"");
    expect(html).toContain("data-testid=\"count-added\"");
    expect(html).toContain("data-testid=\"count-removed\"");
    expect(html).toContain("data-testid=\"count-unchanged\"");
    expect(html).toContain("3 differences identified");
  });

  it("renders MetadataDiffCard showing side-by-side metadata and highlighting differences", () => {
    const html = renderHtml(
      <MetadataDiffCard metadataDifferences={mockComparison.metadataDifferences} />
    );
    expect(html).toContain("Governing Law");
    expect(html).toContain("State of New York");
    expect(html).toContain("State of Delaware");
    expect(html).toContain("New York County");
    expect(html).toContain("Wilmington, Delaware");
    expect(html).toContain("2 metadata differences");
  });

  it("renders DifferenceCard for modified, added, removed, and unchanged items", () => {
    const modCardHtml = renderHtml(
      <DifferenceCard diff={mockDifferences[0]} documentAId="doc-1" documentBId="doc-2" />
    );
    expect(modCardHtml).toContain("Section 1: Term and Termination (Modified)");
    expect(modCardHtml).toContain("Agreement shall continue for a period of two (2) years.");
    expect(modCardHtml).toContain("Agreement shall continue for a period of three (3) years.");
    expect(modCardHtml).toContain("View in Document A");
    expect(modCardHtml).toContain("View in Document B");

    const addCardHtml = renderHtml(
      <DifferenceCard diff={mockDifferences[1]} documentAId="doc-1" documentBId="doc-2" />
    );
    expect(addCardHtml).toContain("Section 4: Non-Solicitation (Added in Document B)");
    expect(addCardHtml).toContain("Clause absent from Document A");
    expect(addCardHtml).toContain("View in Document B");
  });

  it("renders DifferencesList with category filter tabs and search input", () => {
    const html = renderHtml(
      <DifferencesList
        differences={mockDifferences}
        documentAId="doc-1"
        documentBId="doc-2"
      />
    );
    expect(html).toContain("data-testid=\"filter-tab-all\"");
    expect(html).toContain("data-testid=\"filter-tab-modified\"");
    expect(html).toContain("data-testid=\"filter-tab-added\"");
    expect(html).toContain("data-testid=\"filter-tab-removed\"");
    expect(html).toContain("data-testid=\"filter-tab-unchanged\"");
    expect(html).toContain("data-testid=\"diff-search-input\"");
    expect(html).toContain("diff-card-diff-mod-1");
  });

  it("renders ComparisonEmptyState for all empty scenarios", () => {
    const fewDocsHtml = renderHtml(<ComparisonEmptyState type="fewer_than_two_docs" />);
    expect(fewDocsHtml).toContain("Upload at least two documents");

    const noSelectHtml = renderHtml(<ComparisonEmptyState type="no_selection" />);
    expect(noSelectHtml).toContain("Select Two Documents to Compare");

    const identHtml = renderHtml(<ComparisonEmptyState type="identical_selection" />);
    expect(identHtml).toContain("Identical Documents Selected");

    const unreadyHtml = renderHtml(<ComparisonEmptyState type="unready_docs" />);
    expect(unreadyHtml).toContain("Document Still Processing");
  });

  it("renders ComparisonWorkspace assembling all elements with initialComparison", () => {
    const html = renderHtml(
      <ComparisonWorkspace
        userDocuments={mockUserDocuments}
        initialComparison={mockComparison}
        initialDocAId="doc-1"
        initialDocBId="doc-2"
      />
    );
    expect(html).toContain("data-testid=\"comparison-workspace\"");
    expect(html).toContain("data-testid=\"compare-disclaimer-banner\"");
    expect(html).toContain("data-testid=\"document-selector-pair\"");
    expect(html).toContain("data-testid=\"comparison-results\"");
    expect(html).toContain("data-testid=\"comparison-summary-card\"");
    expect(html).toContain("data-testid=\"metadata-diff-card\"");
    expect(html).toContain("data-testid=\"differences-list-container\"");
  });
});


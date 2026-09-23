/**
 * Unit Tests — Professional Prep UI Components & Workspace Integration (Phase 8)
 *
 * Verifies:
 * 1. PrepDisclaimerBanner & Footer:
 *    - Prominently displays legal advice disclaimer and organizational notice.
 *    - Explicitly affirms ClauseWise is not a law firm.
 * 2. PrepExportControls:
 *    - Renders Copy Briefing (Markdown) and Print / Save PDF controls.
 * 3. PrepDocumentOverview:
 *    - Displays filename, document type badge (stated vs inferred), parties, governing law, jurisdiction.
 *    - Displays executive summary when available.
 * 4. PrepKeyClauses:
 *    - Renders key sections with section badges, page numbers, importance reasons, and excerpts.
 * 5. PrepFindingsReview:
 *    - Renders attention items, absent standard provisions (without fake quotes), and ambiguities.
 * 6. PrepOpenActions:
 *    - Renders review actions with checkbox triggers, title, description, and finding quotes.
 *    - Renders friendly empty state when no actions exist.
 * 7. PrepQuestionsForCounsel:
 *    - Renders discussion-framed clarification prompts with category badges and source refs.
 * 8. PrepUserQuestions:
 *    - Renders recorded questions with timestamps.
 * 9. DocumentHeader & DocumentWorkspace Tab Integration:
 *    - Renders "Professional Prep" tab in DocumentHeader with open actions counter badge.
 *    - Renders panel-prep in DocumentWorkspace when activeTab is "prep".
 */

import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { PrepDisclaimerBanner, PrepDisclaimerFooter } from "@/components/prep/PrepDisclaimerBanner";
import { PrepExportControls } from "@/components/prep/PrepExportControls";
import { PrepDocumentOverview } from "@/components/prep/PrepDocumentOverview";
import { PrepKeyClauses } from "@/components/prep/PrepKeyClauses";
import { PrepFindingsReview } from "@/components/prep/PrepFindingsReview";
import { PrepOpenActions } from "@/components/prep/PrepOpenActions";
import { PrepQuestionsForCounsel } from "@/components/prep/PrepQuestionsForCounsel";
import { PrepUserQuestions } from "@/components/prep/PrepUserQuestions";
import { ProfessionalPrepTab } from "@/components/prep/ProfessionalPrepTab";
import { DocumentHeader } from "@/components/workspace/DocumentHeader";
import { DocumentWorkspace } from "@/components/workspace/DocumentWorkspace";
import type { ProfessionalPrepData } from "@/lib/services/preparation-service";
import type { WorkspaceDocument, WorkspaceSection, DocumentFinding, ActionWithDetails } from "@/types";

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const mockDocument: WorkspaceDocument = {
  id: "doc-111",
  filename: "Employment_Agreement.pdf",
  mimeType: "application/pdf",
  fileSizeBytes: 45000,
  documentType: "employment_agreement",
  status: "ready",
  pageCount: 5,
  createdAt: new Date("2026-09-01"),
  updatedAt: new Date("2026-09-01"),
  errorMessage: null,
  governingLaw: "State of New York",
  jurisdiction: "New York County",
  parties: [
    { name: "Apex Technologies Inc.", role: "Employer" },
    { name: "Jane Doe", role: "Employee" },
  ],
  metadata: {
    classification: { isStatedInText: true },
    executiveSummary: "Executive employment contract outlining salary, duties, and covenants.",
    importantSections: [
      {
        sectionId: "sec-1",
        sectionOrderIndex: 0,
        title: "1. Term and Duties",
        reason: "Outlines role scope and term duration.",
      },
    ],
  },
};

const mockSections: WorkspaceSection[] = [
  {
    id: "sec-1",
    orderIndex: 0,
    sectionNumber: 1,
    title: "1. Term and Duties",
    content: "Employee shall serve as Vice President of Engineering for a term of 2 years.",
    pageStart: 1,
    pageEnd: 2,
  },
];

const mockSectionsById = new Map<string, WorkspaceSection>([
  ["sec-1", mockSections[0]],
]);

const mockFindings: DocumentFinding[] = [
  {
    id: "f-1",
    documentId: "doc-111",
    sectionId: "sec-1",
    chunkId: null,
    findingType: "attention",
    importance: "needs_attention",
    label: "Non-Compete Duration",
    summary: "Restrictive covenant restricts competition for 24 months post-employment.",
    sourceText: "Employee agrees not to engage in competing business for 24 months.",
    pageNumber: 2,
    metadata: null,
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
  },
  {
    id: "f-2",
    documentId: "doc-111",
    sectionId: null,
    chunkId: null,
    findingType: "missing_information",
    importance: "needs_attention",
    label: "Missing Severance Provision",
    summary: "The agreement does not contain standard severance pay upon termination.",
    sourceText: null,
    pageNumber: null,
    metadata: { expectedTopic: "Severance Pay" },
    createdAt: new Date("2026-09-01"),
    updatedAt: new Date("2026-09-01"),
  },
];

const mockActions: ActionWithDetails[] = [
  {
    id: "act-1",
    documentId: "doc-111",
    findingId: "f-1",
    userId: "usr-1",
    title: "Negotiate non-compete geographic scope",
    description: "Request limiting restriction to New York metropolitan area.",
    status: "open",
    createdAt: new Date("2026-09-10"),
    updatedAt: new Date("2026-09-10"),
    completedAt: null,
    document: { id: "doc-111", title: "Employment", originalFilename: "Employment_Agreement.pdf" },
    finding: {
      id: "f-1",
      findingType: "attention",
      importance: "needs_attention",
      label: "Non-Compete Duration",
      summary: "Restrictive covenant restricts competition.",
      sourceText: "Employee agrees not to engage in competing business for 24 months.",
      pageNumber: 2,
      sectionId: "sec-1",
      sectionTitle: "1. Term and Duties",
    },
  },
];

const mockPrepData: ProfessionalPrepData = {
  document: {
    id: mockDocument.id,
    filename: mockDocument.filename,
    documentType: mockDocument.documentType,
    isStatedType: true,
    parties: mockDocument.parties,
    governingLaw: mockDocument.governingLaw,
    jurisdiction: mockDocument.jurisdiction,
    pageCount: mockDocument.pageCount,
    fileSizeBytes: mockDocument.fileSizeBytes,
    createdAt: mockDocument.createdAt!,
    executiveSummary: "Executive employment contract outlining salary, duties, and covenants.",
  },
  keyClauses: [
    {
      sectionId: "sec-1",
      orderIndex: 0,
      sectionNumber: 1,
      title: "1. Term and Duties",
      pageStart: 1,
      pageEnd: 2,
      importanceReason: "Outlines role scope and term duration.",
      verbatimExcerpt: "Employee shall serve as Vice President of Engineering for a term of 2 years.",
    },
  ],
  findingsSummary: {
    attentionItems: [mockFindings[0]],
    ambiguitiesAndInconsistencies: [],
    missingProvisions: [mockFindings[1]],
    obligationsAndTerms: [],
    totalFindingsCount: 2,
  },
  openActions: mockActions,
  completedActionsCount: 0,
  userQuestions: [
    {
      id: "uq-1",
      conversationId: "convo-1",
      question: "Is the bonus guaranteed or discretionary?",
      createdAt: new Date("2026-09-05"),
    },
  ],
  clarificationQuestions: [
    {
      id: "cq-1",
      question: "Discuss with counsel whether a standard provision regarding \"Severance Pay\" should be incorporated.",
      category: "missing_provision",
      findingId: "f-2",
      catalogTopic: "Severance Pay",
    },
    {
      id: "cq-2",
      question: "Review the obligations and potential implications of \"Non-Compete Duration\" in 1. Term and Duties with counsel.",
      category: "attention_item",
      findingId: "f-1",
      sectionId: "sec-1",
      sectionTitle: "1. Term and Duties",
      pageNumber: 2,
      sourceText: "Employee agrees not to engage in competing business for 24 months.",
    },
  ],
  generatedAt: new Date("2026-09-23"),
};

function renderHtml(element: React.ReactElement): string {
  return renderToString(element).replace(/<!-- -->/g, "");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Professional Prep UI Components", () => {
  it("renders PrepDisclaimerBanner and Footer with explicit non-lawyer notice", () => {
    const bannerHtml = renderHtml(<PrepDisclaimerBanner />);
    expect(bannerHtml).toContain("Organizational &amp; Consultation Briefing Only");
    expect(bannerHtml).toContain("not a law firm or legal representative");
    expect(bannerHtml).toContain("does not constitute legal advice");

    const footerHtml = renderHtml(<PrepDisclaimerFooter />);
    expect(footerHtml).toContain("No attorney-client relationship is formed");
  });

  it("renders PrepExportControls with copy and print buttons", () => {
    const html = renderHtml(<PrepExportControls onCopyMarkdown={() => {}} />);
    expect(html).toContain("Copy Briefing (Markdown)");
    expect(html).toContain("Print / Save PDF");
    expect(html).toContain("data-testid=\"prep-copy-markdown-btn\"");
    expect(html).toContain("data-testid=\"prep-print-btn\"");
  });

  it("renders PrepDocumentOverview with complete document profile and parties", () => {
    const html = renderHtml(<PrepDocumentOverview document={mockPrepData.document} />);
    expect(html).toContain("Employment Agreement");
    expect(html).toContain("Apex Technologies Inc.");
    expect(html).toContain("Employer");
    expect(html).toContain("State of New York");
    expect(html).toContain("New York County");
    expect(html).toContain("Executive employment contract");
  });

  it("renders PrepKeyClauses with section number, page range, and reason", () => {
    const html = renderHtml(
      <PrepKeyClauses keyClauses={mockPrepData.keyClauses} onSelectSection={() => {}} />
    );
    expect(html).toContain("1. Term and Duties");
    expect(html).toContain("Section 1");
    expect(html).toContain("Page 1–2");
    expect(html).toContain("Outlines role scope and term duration.");
    expect(html).toContain("View in Document Text");
  });

  it("renders PrepFindingsReview with attention items and missing provisions without fake excerpts", () => {
    const html = renderHtml(
      <PrepFindingsReview
        findingsSummary={mockPrepData.findingsSummary}
        sectionsById={mockSectionsById}
      />
    );
    // Attention item with verbatim quote
    expect(html).toContain("Non-Compete Duration");
    expect(html).toContain("Employee agrees not to engage in competing business");
    expect(html).toContain("Page 2");

    // Absent provision without fake quote
    expect(html).toContain("Absent Standard Provision");
    expect(html).toContain("Missing Severance Provision");
  });

  it("renders PrepOpenActions with review items and counters", () => {
    const html = renderHtml(
      <PrepOpenActions actions={mockActions} completedCount={0} />
    );
    expect(html).toContain("Negotiate non-compete geographic scope");
    expect(html).toContain("1 open");
    expect(html).toContain("Employee agrees not to engage in competing business");
  });

  it("renders PrepOpenActions empty state when action list is empty", () => {
    const html = renderHtml(
      <PrepOpenActions actions={[]} completedCount={2} />
    );
    expect(html).toContain("No Open Review Items");
    expect(html).toContain("2 completed");
  });

  it("renders PrepQuestionsForCounsel with objective discussion prompts", () => {
    const html = renderHtml(
      <PrepQuestionsForCounsel questions={mockPrepData.clarificationQuestions} />
    );
    expect(html).toContain("Suggested Questions for Legal Counsel");
    expect(html).toContain("Discuss with counsel whether a standard provision regarding");
    expect(html).toContain("Review the obligations and potential implications");
    expect(html).toContain("Absent Provision Inquiry");
    expect(html).toContain("Priority Clause Review");
  });

  it("renders PrepUserQuestions with recorded questions and timestamps", () => {
    const html = renderHtml(
      <PrepUserQuestions userQuestions={mockPrepData.userQuestions} />
    );
    expect(html).toContain("Is the bonus guaranteed or discretionary?");
  });

  it("renders PrepUserQuestions empty state when zero questions exist", () => {
    const html = renderHtml(<PrepUserQuestions userQuestions={[]} />);
    expect(html).toContain("No Document Questions Recorded Yet");
  });
});

describe("DocumentHeader & DocumentWorkspace Tab Integration", () => {
  it("renders Professional Prep tab in DocumentHeader with open actions counter", () => {
    const html = renderHtml(
      <DocumentHeader
        document={mockDocument}
        sectionCount={1}
        activeTab="prep"
        onTabChange={() => {}}
        openActionsCount={3}
      />
    );
    expect(html).toContain("Professional Prep");
    expect(html).toContain("data-testid=\"tab-prep-btn\"");
    expect(html).toContain(">3<");
  });

  it("renders ProfessionalPrepTab in DocumentWorkspace when initialTab is prep", () => {
    const html = renderHtml(
      <DocumentWorkspace
        data={{ document: mockDocument, sections: mockSections }}
        findings={mockFindings}
        initialTab="prep"
        initialPrepData={mockPrepData}
      />
    );
    expect(html).toContain("data-testid=\"professional-prep-panel\"");
    expect(html).toContain("data-testid=\"professional-prep-tab\"");
    expect(html).toContain("Professional Legal Briefing");
    expect(html).toContain("Employment Agreement");
  });

  it("renders DocumentWorkspace with fallback assembly when initialPrepData is not provided", () => {
    const html = renderHtml(
      <DocumentWorkspace
        data={{ document: mockDocument, sections: mockSections }}
        findings={mockFindings}
        initialTab="prep"
      />
    );
    expect(html).toContain("data-testid=\"professional-prep-panel\"");
    expect(html).toContain("Professional Legal Briefing");
    expect(html).toContain("Employment Agreement");
  });
});

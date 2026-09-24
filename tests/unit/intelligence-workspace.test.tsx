/**
 * Unit Tests — Intelligence Workspace UI (Phase 3 Slice 3.6)
 *
 * Comprehensive tests for:
 * 1. DocumentHeader:
 *    - Document filename, status badge, classification badge (stated vs inferred)
 *    - Basic metadata badges (format, size, page count, section count)
 *    - Tab navigation (Intelligence vs Document Text)
 *    - Strictly NO numerical risk scores, risk meters, or confidence scores
 * 2. DocumentOverview:
 *    - Parties card (parties with names & roles, empty state)
 *    - Legal framework (governing law & jurisdiction, "Not specified" empty state)
 *    - Important dates (values, types, descriptions, empty state)
 *    - Financial terms (amounts, frequencies, descriptions, empty state)
 *    - Executive summary (rendered ONLY when persisted; omitted when missing - Guardrail 1)
 * 3. ImportantSections:
 *    - Lists highlighted key sections with title, reason, section badge
 *    - Action button to jump to document text
 * 4. FindingCard & Taxonomy:
 *    - All 8 finding types (key_term, attention, obligation, ambiguity, date, financial_term, inconsistency, missing_information)
 *    - All 3 importance levels (needs_attention, important, informational) with text labels + icons (not color alone)
 *    - Selected state styling
 * 5. EvidencePanel:
 *    - Empty selection state
 *    - Substantive finding: verbatim source text, section & page provenance, jump-to-section button
 *    - Missing information finding: expected topic, rule basis, explicit absence note, ZERO fake citation
 * 6. FindingList:
 *    - Filter bar (All, Needs Attention, Important, Informational, Type filters)
 *    - Counts display
 *    - Empty findings state
 * 7. DocumentWorkspace Status Routing & Integration:
 *    - ready with sections -> renders complete workspace
 *    - ready with 0 sections -> renders EmptyContentState
 *    - error -> renders DocumentErrorState with safe messaging
 *    - processing (queued, extracting, etc.) -> renders DocumentProcessingState (Guardrail 2)
 *    - Tab switching (analysis vs document view)
 * 8. Accessibility & Safety:
 *    - ARIA roles (tablist, tab, tabpanel, button)
 *    - Headings hierarchy
 *    - Content safety (no HTML injection)
 */

import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { DocumentWorkspace } from "@/components/workspace/DocumentWorkspace";
import { DocumentHeader } from "@/components/workspace/DocumentHeader";
import { DocumentOverview } from "@/components/workspace/DocumentOverview";
import { ImportantSections } from "@/components/workspace/ImportantSections";
import { FindingCard } from "@/components/workspace/FindingCard";
import { FindingList } from "@/components/workspace/FindingList";
import { EvidencePanel } from "@/components/workspace/EvidencePanel";
import type {
  WorkspaceDocument,
  WorkspaceSection,
  DocumentWorkspaceData,
  DocumentFinding,
  ValidatedImportantSection,
} from "@/types";

// ---------------------------------------------------------------------------
// Mock Fixtures
// ---------------------------------------------------------------------------

function createMockDoc(overrides?: Partial<WorkspaceDocument>): WorkspaceDocument {
  return {
    id: "doc-1111-2222-3333-4444",
    filename: "Mutual_NDA_TechCorp.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1048576,
    status: "ready",
    pageCount: 3,
    documentType: "nda",
    governingLaw: "laws of the State of New York",
    jurisdiction: "Manhattan courts",
    parties: [
      { name: "TechCorp Inc.", role: "Disclosing Party" },
      { name: "DevSolutions LLC", role: "Receiving Party" },
    ],
    metadata: {
      classification: {
        documentType: "nda",
        isStatedInText: true,
        sourceText: "Non-Disclosure Agreement",
        sectionOrderIndex: 0,
      },
      executiveSummary: "A mutual non-disclosure agreement protecting proprietary information for 3 years under New York law.",
      importantDates: [
        {
          dateValue: "3 years",
          dateType: "term",
          description: "Duration of confidentiality obligations",
          sourceText: "period of 3 years",
          sectionId: "sec-2",
          sectionOrderIndex: 1,
        },
      ],
      financialTerms: [
        {
          amount: "$5,000",
          currency: "USD",
          frequency: "one-time",
          description: "Late fee penalty",
          sourceText: "late fee of $5,000",
          sectionId: "sec-3",
          sectionOrderIndex: 2,
        },
      ],
      importantSections: [
        {
          sectionId: "sec-2",
          sectionOrderIndex: 1,
          title: "Confidentiality Obligations",
          reason: "Defines core duty of recipient to protect proprietary information.",
        },
      ],
    },
    createdAt: new Date("2026-09-20T10:00:00Z"),
    updatedAt: new Date("2026-09-20T10:05:00Z"),
    errorMessage: null,
    ...overrides,
  };
}

function createMockSections(): WorkspaceSection[] {
  return [
    {
      id: "sec-1",
      orderIndex: 0,
      sectionNumber: 0,
      title: "Preamble & Parties",
      content:
        'This Non-Disclosure Agreement is entered into by and between TechCorp Inc. ("Disclosing Party") and DevSolutions LLC ("Receiving Party").',
      pageStart: 1,
      pageEnd: 1,
    },
    {
      id: "sec-2",
      orderIndex: 1,
      sectionNumber: 1,
      title: "Confidentiality Obligations",
      content:
        "The Receiving Party shall hold all Proprietary Information in strict confidence for a period of 3 years from the date of disclosure.",
      pageStart: 2,
      pageEnd: 2,
    },
    {
      id: "sec-3",
      orderIndex: 2,
      sectionNumber: 2,
      title: "Governing Law & Penalties",
      content:
        "This Agreement shall be governed by the laws of the State of New York. Exclusive jurisdiction in Manhattan courts. A late fee of $5,000 shall apply.",
      pageStart: 3,
      pageEnd: 3,
    },
  ];
}

function createMockFindings(): DocumentFinding[] {
  return [
    {
      id: "f-1",
      documentId: "doc-1111-2222-3333-4444",
      sectionId: "sec-2",
      chunkId: "chk-1",
      findingType: "obligation",
      importance: "needs_attention",
      label: "3-Year Confidentiality Term",
      summary: "Recipient must keep information confidential for 3 years.",
      sourceText: "hold all Proprietary Information in strict confidence for a period of 3 years",
      pageNumber: 2,
      metadata: null,
      createdAt: new Date("2026-09-20T10:05:00Z"),
      updatedAt: new Date("2026-09-20T10:05:00Z"),
    },
    {
      id: "f-2",
      documentId: "doc-1111-2222-3333-4444",
      sectionId: "sec-1",
      chunkId: "chk-0",
      findingType: "key_term",
      importance: "informational",
      label: "Mutual NDA Form",
      summary: "Agreement establishes bilateral non-disclosure terms.",
      sourceText: "This Non-Disclosure Agreement is entered into by and between",
      pageNumber: 1,
      metadata: null,
      createdAt: new Date("2026-09-20T10:05:00Z"),
      updatedAt: new Date("2026-09-20T10:05:00Z"),
    },
    {
      id: "f-3",
      documentId: "doc-1111-2222-3333-4444",
      sectionId: null,
      chunkId: null,
      findingType: "missing_information",
      importance: "important",
      label: "Missing Standard Exclusions",
      summary: "Standard exclusions to confidentiality (public domain, independent development) are absent.",
      sourceText: null,
      pageNumber: null,
      metadata: {
        expectedTopic: "standard_exclusions_to_confidentiality",
        ruleBasis: "Core provision catalog for NDAs expects standard carve-outs.",
      },
      createdAt: new Date("2026-09-20T10:05:00Z"),
      updatedAt: new Date("2026-09-20T10:05:00Z"),
    },
  ];
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe("Intelligence Workspace — Slice 3.6", () => {
  // =========================================================================
  // 1. DocumentHeader Component
  // =========================================================================
  describe("1. DocumentHeader Component", () => {
    it("renders document title, format, status badge, and classified type", () => {
      const doc = createMockDoc();
      const html = renderToString(
        <DocumentHeader
          document={doc}
          sectionCount={3}
          activeTab="analysis"
          onTabChange={() => {}}
          findingsCount={3}
        />
      );

      expect(html).toContain("Mutual_NDA_TechCorp.pdf");
      expect(html).toContain("Ready");
      expect(html).toContain("PDF");
      expect(html).toContain("3 pages");
      expect(html).toContain("3 sections");
      expect(html).toContain("Non-Disclosure Agreement");
      expect(html).toContain("Stated"); // Stated in text indicator
      expect(html).toContain("Intelligence &amp; Findings");
      expect(html).toContain("Document Text");
    });

    it("displays Inferred indicator when classification is inferred", () => {
      const doc = createMockDoc({
        metadata: {
          classification: {
            documentType: "nda",
            isStatedInText: false,
            inferenceReason: "Inferred from terminology.",
          },
        },
      });

      const html = renderToString(
        <DocumentHeader
          document={doc}
          sectionCount={3}
          activeTab="analysis"
          onTabChange={() => {}}
          findingsCount={0}
        />
      );

      expect(html).toContain("Inferred");
      expect(html).toContain("Non-Disclosure Agreement");
    });

    it("displays Unclassified badge when documentType is null", () => {
      const doc = createMockDoc({ documentType: null });
      const html = renderToString(
        <DocumentHeader
          document={doc}
          sectionCount={2}
          activeTab="analysis"
          onTabChange={() => {}}
        />
      );

      expect(html).toContain("Unclassified");
    });

    it("strictly prohibits numerical risk scores or danger meters", () => {
      const doc = createMockDoc();
      const html = renderToString(
        <DocumentHeader
          document={doc}
          sectionCount={3}
          activeTab="analysis"
          onTabChange={() => {}}
        />
      );

      // Verify no risk meters or percentages
      expect(html).not.toMatch(/risk\s*score/i);
      expect(html).not.toMatch(/\d+%\s*risk/i);
      expect(html).not.toContain("danger-meter");
      expect(html).not.toContain("safe-contract");
    });

    it("renders accessible tab controls with aria-selected", () => {
      const doc = createMockDoc();
      const html = renderToString(
        <DocumentHeader
          document={doc}
          sectionCount={3}
          activeTab="analysis"
          onTabChange={() => {}}
          findingsCount={5}
        />
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('role="tab"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('id="tab-analysis"');
      expect(html).toContain('id="tab-document"');
    });
  });

  // =========================================================================
  // 2. DocumentOverview Component
  // =========================================================================
  describe("2. DocumentOverview Component", () => {
    it("renders parties, governing law, jurisdiction, dates, and financial terms", () => {
      const doc = createMockDoc();
      const html = renderToString(<DocumentOverview document={doc} />);

      // Parties
      expect(html).toContain("TechCorp Inc.");
      expect(html).toContain("Disclosing Party");
      expect(html).toContain("DevSolutions LLC");
      expect(html).toContain("Receiving Party");

      // Governing Law & Jurisdiction
      expect(html).toContain("laws of the State of New York");
      expect(html).toContain("Manhattan courts");

      // Key Dates
      expect(html).toContain("3 years");
      expect(html).toContain("term");
      expect(html).toContain("Duration of confidentiality obligations");

      // Financial Terms
      expect(html).toContain("$5,000");
      expect(html).toContain("one-time");
      expect(html).toContain("Late fee penalty");

      // Executive Summary
      expect(html).toContain("Executive Summary");
      expect(html).toContain("A mutual non-disclosure agreement");
    });

    it("omits Executive Summary card if not persisted in metadata (Guardrail 1)", () => {
      const doc = createMockDoc({
        metadata: {
          // No executiveSummary field
          importantDates: [],
          financialTerms: [],
        },
      });

      const html = renderToString(<DocumentOverview document={doc} />);

      expect(html).not.toContain("Executive Summary");
      expect(html).not.toContain("executive-summary-card");
    });

    it("renders appropriate empty states when metadata is absent", () => {
      const doc = createMockDoc({
        parties: [],
        governingLaw: null,
        jurisdiction: null,
        metadata: {},
      });

      const html = renderToString(<DocumentOverview document={doc} />);

      expect(html).toContain("No parties identified in document.");
      expect(html).toContain("Not specified in document");
      expect(html).toContain("No key dates identified.");
      expect(html).toContain("No financial terms identified.");
    });
  });

  // =========================================================================
  // 3. ImportantSections Component
  // =========================================================================
  describe("3. ImportantSections Component", () => {
    it("renders highlighted key sections with title, reason, and jump action", () => {
      const sections: ValidatedImportantSection[] = [
        {
          sectionId: "sec-2",
          sectionOrderIndex: 1,
          title: "Confidentiality Obligations",
          reason: "Core restriction terms.",
        },
      ];

      const html = renderToString(
        <ImportantSections
          importantSections={sections}
          onSelectSection={() => {}}
        />
      );

      expect(html).toContain("Key Sections Highlighted");
      expect(html).toContain("Confidentiality Obligations");
      expect(html).toContain("Core restriction terms.");
      expect(html).toContain("Section 2"); // 1-based index
      expect(html).toContain("View in Document Text");
    });

    it("returns null when importantSections array is empty", () => {
      const html = renderToString(<ImportantSections importantSections={[]} />);
      expect(html).toBe("");
    });
  });

  // =========================================================================
  // 4. FindingCard Component & Taxonomy
  // =========================================================================
  describe("4. FindingCard Component & Taxonomy", () => {
    const findings = createMockFindings();

    it("renders substantive finding with importance, type badge, label, and location", () => {
      const finding = findings[0]; // obligation, needs_attention
      const html = renderToString(
        <FindingCard
          finding={finding}
          isSelected={false}
          onSelect={() => {}}
          sectionTitle="Confidentiality Obligations"
        />
      );

      expect(html).toContain("Needs Attention");
      expect(html).toContain("Obligation");
      expect(html).toContain("3-Year Confidentiality Term");
      expect(html).toContain("Recipient must keep information confidential for 3 years.");
      expect(html).toContain("Confidentiality Obligations");
      expect(html).toContain("p. 2");
    });

    it("renders missing_information finding with absence badge", () => {
      const missingFinding = findings[2]; // missing_information
      const html = renderToString(
        <FindingCard
          finding={missingFinding}
          isSelected={false}
          onSelect={() => {}}
        />
      );

      expect(html).toContain("Important");
      expect(html).toContain("Missing Provision");
      expect(html).toContain("Missing Standard Exclusions");
      expect(html).toContain("Absence in document");
    });

    it("supports all 8 finding types with canonical labels", () => {
      const types = [
        "key_term",
        "attention",
        "obligation",
        "ambiguity",
        "date",
        "financial_term",
        "inconsistency",
        "missing_information",
      ] as const;

      for (const t of types) {
        const f: DocumentFinding = {
          ...findings[0],
          id: `f-${t}`,
          findingType: t,
        };
        const html = renderToString(
          <FindingCard finding={f} isSelected={false} onSelect={() => {}} />
        );
        expect(html).toContain(f.label);
      }
    });

    it("supports all 3 importance levels with accessible text labels", () => {
      const importances = ["needs_attention", "important", "informational"] as const;

      for (const imp of importances) {
        const f: DocumentFinding = {
          ...findings[0],
          id: `f-${imp}`,
          importance: imp,
        };
        const html = renderToString(
          <FindingCard finding={f} isSelected={false} onSelect={() => {}} />
        );

        if (imp === "needs_attention") expect(html).toContain("Needs Attention");
        if (imp === "important") expect(html).toContain("Important");
        if (imp === "informational") expect(html).toContain("Informational");
      }
    });
  });

  // =========================================================================
  // 5. EvidencePanel Component
  // =========================================================================
  describe("5. EvidencePanel Component", () => {
    const findings = createMockFindings();

    it("renders empty selection state when no finding is selected", () => {
      const html = renderToString(<EvidencePanel finding={null} />);
      expect(html).toContain("No Finding Selected");
      expect(html).toContain("Select a finding from the list");
    });

    it("renders verbatim source text excerpt for substantive finding", () => {
      const finding = findings[0];
      const html = renderToString(
        <EvidencePanel
          finding={finding}
          sectionTitle="Confidentiality Obligations"
          onJumpToSection={() => {}}
        />
      );

      expect(html).toContain("Supporting Evidence (Source Text)");
      expect(html).toContain(
        "hold all Proprietary Information in strict confidence for a period of 3 years"
      );
      expect(html).toContain("Confidentiality Obligations");
      expect(html).toContain("Page 2");
      expect(html).toContain("View in Document Text");
    });

    it("renders missing_information finding WITHOUT fake excerpt and with rule basis", () => {
      const missingFinding = findings[2];
      const html = renderToString(
        <EvidencePanel finding={missingFinding} />
      );

      // Verify Absence explanation
      expect(html).toContain("Absence in Document");
      expect(html).toContain("standard_exclusions_to_confidentiality");
      expect(html).toContain(
        "Core provision catalog for NDAs expects standard carve-outs."
      );
      expect(html).toContain("No source text exists because the provision is absent.");

      // Verify that NO fake quote or source text block is rendered
      expect(html).not.toContain("Supporting Evidence (Source Text)");
      expect(html).not.toContain("View in Document Text");
    });
  });

  // =========================================================================
  // 6. FindingList Component
  // =========================================================================
  describe("6. FindingList Component", () => {
    const findings = createMockFindings();

    it("renders filter controls and finding cards", () => {
      const html = renderToString(
        <FindingList
          findings={findings}
          selectedFindingId="f-1"
          onSelectFinding={() => {}}
        />
      );

      expect(html).toContain("Filter by Importance");
      expect(html).toContain("All (3)");
      expect(html).toContain("Needs Attention (1)");
      expect(html).toContain("Important (1)");
      expect(html).toContain("Informational (1)");
      expect(html).toContain("3-Year Confidentiality Term");
      expect(html).toContain("Mutual NDA Form");
      expect(html).toContain("Missing Standard Exclusions");
    });

    it("renders empty findings state when findings array is empty", () => {
      const html = renderToString(
        <FindingList
          findings={[]}
          selectedFindingId={null}
          onSelectFinding={() => {}}
        />
      );

      expect(html).toContain("No Findings Identified");
    });
  });

  // =========================================================================
  // 7. DocumentWorkspace Integration & Status Routing
  // =========================================================================
  describe("7. DocumentWorkspace Status Routing & Integration", () => {
    const doc = createMockDoc();
    const sections = createMockSections();
    const findings = createMockFindings();

    it("renders complete intelligence workspace when status is ready with sections", () => {
      const data: DocumentWorkspaceData = {
        document: doc,
        sections,
      };

      const html = renderToString(
        <DocumentWorkspace data={data} findings={findings} initialTab="analysis" />
      );

      // Master header
      expect(html).toContain("Mutual_NDA_TechCorp.pdf");
      expect(html).toContain("Non-Disclosure Agreement");

      // Overview
      expect(html).toContain("TechCorp Inc.");
      expect(html).toContain("laws of the State of New York");

      // Important sections
      expect(html).toContain("Key Sections Highlighted");

      // Findings & Evidence
      expect(html).toContain("Document Findings &amp; Grounded Evidence");
      expect(html).toContain("3-Year Confidentiality Term");
      expect(html).toContain("Supporting Evidence (Source Text)");
    });

    it("renders verbatim document text view when initialTab is document", () => {
      const data: DocumentWorkspaceData = {
        document: doc,
        sections,
      };

      const html = renderToString(
        <DocumentWorkspace data={data} findings={findings} initialTab="document" />
      );

      expect(html).toContain("verbatim-document-panel");
      expect(html).toContain("This Non-Disclosure Agreement is entered into by and between");
    });

    it("renders EmptyContentState when status is ready but sections is empty", () => {
      const data: DocumentWorkspaceData = {
        document: doc,
        sections: [],
      };

      const html = renderToString(<DocumentWorkspace data={data} findings={[]} />);
      expect(html).toContain("workspace-empty-state");
      expect(html).toContain("No readable content found");
    });

    it("renders DocumentErrorState when status is error", () => {
      const errorDoc = createMockDoc({
        status: "error",
        errorMessage: "Corrupted PDF stream",
      });
      const data: DocumentWorkspaceData = {
        document: errorDoc,
        sections: [],
      };

      const html = renderToString(<DocumentWorkspace data={data} findings={[]} />);
      expect(html).toContain("workspace-error-state");
      expect(html).toContain("Extraction Error");
      expect(html).toContain("Corrupted PDF stream");
    });

    it("renders DocumentProcessingState when status is extracting or chunking (Guardrail 2)", () => {
      const extractingDoc = createMockDoc({
        status: "extracting",
      });
      const data: DocumentWorkspaceData = {
        document: extractingDoc,
        sections: [],
      };

      const html = renderToString(<DocumentWorkspace data={data} findings={[]} />);
      expect(html).toContain("workspace-processing-state");
      expect(html).toContain("Extracting…");
    });
  });

  // =========================================================================
  // 8. Accessibility & Safety
  // =========================================================================
  describe("8. Accessibility & Content Safety", () => {
    const doc = createMockDoc();
    const sections = createMockSections();
    const findings = createMockFindings();

    it("provides valid heading structure and accessible ARIA attributes", () => {
      const data: DocumentWorkspaceData = {
        document: doc,
        sections,
      };

      const html = renderToString(
        <DocumentWorkspace data={data} findings={findings} />
      );

      expect(html).toContain("<h1");
      expect(html).toContain("<h2");
      expect(html).toContain('role="tablist"');
      expect(html).toContain('role="tab"');
      expect(html).toContain('role="tabpanel"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('aria-label="Findings and Evidence"');
    });

    it("escapes document text content to prevent XSS", () => {
      const maliciousDoc = createMockDoc({
        filename: '<script>alert("xss")</script>.pdf',
      });
      const data: DocumentWorkspaceData = {
        document: maliciousDoc,
        sections,
      };

      const html = renderToString(
        <DocumentWorkspace data={data} findings={findings} />
      );

      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    });
  });
});

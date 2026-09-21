/**
 * Unit Tests — Document Workspace UI Rendering (Phase 2, Slice 2.3)
 *
 * Covers:
 * 1. DocumentViewer:
 *    - Header rendering (filename, status badge, format, file size, page count)
 *    - Multiple sections: renders sidebar navigation and active section
 *    - Single section: renders directly without redundant sidebar navigation
 *    - Source location: formats single page ("Page 1"), range ("Pages 2–4"), and suppresses display when null
 *    - Fallback section title when title is empty
 *    - Content safety: renders verbatim text as escaped content without HTML execution
 *
 * 2. DocumentWorkspace status routing:
 *    - ready with sections -> renders viewer
 *    - ready with 0 sections -> renders empty content state
 *    - error -> renders error state with safe messaging
 *    - processing statuses (queued, extracting, extracted, chunking, analyzing) -> renders processing state
 *
 * 3. WorkspaceStates:
 *    - DocumentNotFoundState: renders friendly not-found banner with link to /documents
 *    - DocumentProcessingState: renders processing explanation with link to /documents
 *    - DocumentErrorState: renders safe error explanation with link to /documents
 *    - EmptyContentState: renders empty explanation with link to /documents
 */

import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { DocumentWorkspace } from "@/components/workspace/DocumentWorkspace";
import {
  DocumentViewer,
  formatPageRange,
} from "@/components/workspace/DocumentViewer";
import {
  DocumentProcessingState,
  DocumentErrorState,
  EmptyContentState,
  DocumentNotFoundState,
} from "@/components/workspace/WorkspaceStates";
import type {
  WorkspaceDocument,
  WorkspaceSection,
  DocumentWorkspaceData,
  DocumentStatus,
} from "@/types";

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------

function createMockDocument(overrides?: Partial<WorkspaceDocument>): WorkspaceDocument {
  return {
    id: "11111111-1111-4111-a111-111111111111",
    filename: "Non-Disclosure Agreement.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 204800,
    status: "ready",
    pageCount: 3,
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
      sectionNumber: 0,
      title: "Preamble & Parties",
      content: "This Non-Disclosure Agreement is entered into by and between Alpha Corp and Beta LLC.",
      pageStart: 1,
      pageEnd: 1,
    },
    {
      id: "sec-2",
      orderIndex: 1,
      sectionNumber: 1,
      title: "1. Definition of Confidential Information",
      content: "Confidential Information includes all proprietary technical, financial, and business data.",
      pageStart: 1,
      pageEnd: 2,
    },
    {
      id: "sec-3",
      orderIndex: 2,
      sectionNumber: 2,
      title: "2. Non-Disclosure Obligations",
      content: "The Recipient agrees to hold and maintain all Confidential Information in strict confidence.",
      pageStart: 2,
      pageEnd: 3,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Document Workspace UI Rendering", () => {
  // =========================================================================
  // 1. DocumentViewer: Multiple Sections
  // =========================================================================
  describe("1. DocumentViewer with Multiple Sections", () => {
    it("renders document header with filename, format badge, and ready status", () => {
      const doc = createMockDocument();
      const sections = createMockSections();

      const html = renderToString(
        <DocumentViewer document={doc} sections={sections} />
      );

      expect(html).toContain("Non-Disclosure Agreement.pdf");
      expect(html).toContain("Ready");
      expect(html).toContain("PDF");
      expect(html).toContain("3 pages");
      expect(html).toContain("3 sections");
      expect(html).toContain("Documents"); // Back button label
    });

    it("renders section navigation sidebar with all sections in persisted order", () => {
      const doc = createMockDocument();
      const sections = createMockSections();

      const html = renderToString(
        <DocumentViewer document={doc} sections={sections} />
      );

      expect(html).toContain("data-testid=\"multi-section-view\"");
      expect(html).toContain("data-testid=\"section-navigation-sidebar\"");
      expect(html).toContain("Sections (3)");

      // Verify all section titles appear in sidebar
      expect(html).toContain("Preamble &amp; Parties");
      expect(html).toContain("1. Definition of Confidential Information");
      expect(html).toContain("2. Non-Disclosure Obligations");

      // Verify compact sidebar page badges
      expect(html).toContain("p. 1");
      expect(html).toContain("pp. 1–2");
      expect(html).toContain("pp. 2–3");
    });

    it("renders active section content with title, section counter, and pagination controls", () => {
      const doc = createMockDocument();
      const sections = createMockSections();

      const html = renderToString(
        <DocumentViewer document={doc} sections={sections} />
      );

      expect(html).toContain("data-testid=\"active-section-content\"");
      expect(html).toContain("Section 1 of 3");
      expect(html).toContain("Page 1");
      expect(html).toContain(
        "This Non-Disclosure Agreement is entered into by and between Alpha Corp and Beta LLC."
      );

      // Pagination buttons
      expect(html).toContain("Previous");
      expect(html).toContain("Next");
      expect(html).toContain("1 / 3");
    });
  });

  // =========================================================================
  // 2. DocumentViewer: Single Section
  // =========================================================================
  describe("2. DocumentViewer with Single Section", () => {
    it("renders content directly without redundant sidebar navigation", () => {
      const doc = createMockDocument();
      const singleSection: WorkspaceSection[] = [
        {
          id: "sec-single",
          orderIndex: 0,
          sectionNumber: 0,
          title: "Full Agreement",
          content: "The entirety of the agreement is contained in this single section.",
          pageStart: 1,
          pageEnd: 1,
        },
      ];

      const html = renderToString(
        <DocumentViewer document={doc} sections={singleSection} />
      );

      // Single-section view rendered
      expect(html).toContain("data-testid=\"single-section-view\"");
      // Sidebar should NOT be rendered
      expect(html).not.toContain("data-testid=\"multi-section-view\"");
      expect(html).not.toContain("data-testid=\"section-navigation-sidebar\"");
      expect(html).toContain("Full Agreement");
      expect(html).toContain(
        "The entirety of the agreement is contained in this single section."
      );
    });
  });

  // =========================================================================
  // 3. Source Location Formatting
  // =========================================================================
  describe("3. Source Location Helper & Formatting", () => {
    it("formats single page correctly", () => {
      expect(formatPageRange(1, 1)).toBe("Page 1");
      expect(formatPageRange(5, 5)).toBe("Page 5");
      expect(formatPageRange(3, null)).toBe("Page 3");
    });

    it("formats multi-page range correctly with en-dash", () => {
      expect(formatPageRange(2, 4)).toBe("Pages 2–4");
      expect(formatPageRange(10, 15)).toBe("Pages 10–15");
    });

    it("returns null for unavailable/null page coordinates without fabricating numbers", () => {
      expect(formatPageRange(null, null)).toBeNull();
      expect(formatPageRange(undefined, undefined)).toBeNull();
      expect(formatPageRange(0, 0)).toBeNull();
      expect(formatPageRange(-1, -1)).toBeNull();
    });

    it("does not render page badges when section page coordinates are null (DOCX/TXT)", () => {
      const doc = createMockDocument({ mimeType: "text/plain", pageCount: null });
      const docxSections: WorkspaceSection[] = [
        {
          id: "sec-docx",
          orderIndex: 0,
          sectionNumber: 1,
          title: "Clause 1",
          content: "DOCX text content.",
          pageStart: null,
          pageEnd: null,
        },
      ];

      const html = renderToString(
        <DocumentViewer document={doc} sections={docxSections} />
      );

      // Should not contain fabricated page strings
      expect(html).not.toContain("Page 0");
      expect(html).not.toContain("Page null");
      expect(html).not.toContain("Page 1");
    });
  });

  // =========================================================================
  // 4. Section Title Fallback
  // =========================================================================
  describe("4. Section Title Fallback", () => {
    it("falls back to 'Section X' when section title is empty or whitespace", () => {
      const doc = createMockDocument();
      const sectionsWithoutTitle: WorkspaceSection[] = [
        {
          id: "sec-untitled-1",
          orderIndex: 0,
          sectionNumber: null,
          title: "",
          content: "Content with no heading.",
          pageStart: 1,
          pageEnd: 1,
        },
        {
          id: "sec-untitled-2",
          orderIndex: 1,
          sectionNumber: 4,
          title: "   ",
          content: "Second content with spaces heading.",
          pageStart: 1,
          pageEnd: 1,
        },
      ];

      const html = renderToString(
        <DocumentViewer document={doc} sections={sectionsWithoutTitle} />
      );

      // Falls back to Section 1 (orderIndex + 1)
      expect(html).toContain("Section 1");
      // Falls back to Section 4 (sectionNumber)
      expect(html).toContain("Section 4");
    });
  });

  // =========================================================================
  // 5. DocumentWorkspace Status Switching
  // =========================================================================
  describe("5. DocumentWorkspace Status Routing", () => {
    it("renders DocumentViewer when status is 'ready' with sections", () => {
      const data: DocumentWorkspaceData = {
        document: createMockDocument({ status: "ready" }),
        sections: createMockSections(),
      };

      const html = renderToString(<DocumentWorkspace data={data} />);

      expect(html).toContain("data-testid=\"document-workspace-viewer\"");
      expect(html).toContain("Non-Disclosure Agreement.pdf");
    });

    it("renders EmptyContentState when status is 'ready' but sections array is empty", () => {
      const data: DocumentWorkspaceData = {
        document: createMockDocument({ status: "ready" }),
        sections: [],
      };

      const html = renderToString(<DocumentWorkspace data={data} />);

      expect(html).toContain("data-testid=\"workspace-empty-state\"");
      expect(html).toContain("No readable content found");
      expect(html).toContain("Back to Documents");
    });

    it("renders DocumentErrorState when status is 'error'", () => {
      const data: DocumentWorkspaceData = {
        document: createMockDocument({
          status: "error",
          errorMessage: "Failed to parse malformed PDF",
        }),
        sections: [],
      };

      const html = renderToString(<DocumentWorkspace data={data} />);

      expect(html).toContain("data-testid=\"workspace-error-state\"");
      expect(html).toContain("Extraction could not be completed");
      expect(html).toContain("Failed to parse malformed PDF");
      expect(html).toContain("Back to Documents");
    });

    it("renders DocumentProcessingState for all other existing statuses", () => {
      const processingStatuses: DocumentStatus[] = [
        "queued",
        "extracting",
        "extracted",
        "chunking",
        "analyzing",
      ];

      for (const status of processingStatuses) {
        const data: DocumentWorkspaceData = {
          document: createMockDocument({ status }),
          sections: [],
        };

        const html = renderToString(<DocumentWorkspace data={data} />);

        expect(html).toContain("data-testid=\"workspace-processing-state\"");
        expect(html).toContain("Document is being processed");
        expect(html).toContain("Back to Documents");
      }
    });
  });

  // =========================================================================
  // 6. WorkspaceStates Components
  // =========================================================================
  describe("6. Standalone WorkspaceStates", () => {
    it("DocumentNotFoundState renders friendly 404 message with back navigation", () => {
      const html = renderToString(<DocumentNotFoundState />);

      expect(html).toContain("data-testid=\"workspace-not-found-state\"");
      expect(html).toContain("Document Not Found");
      expect(html).toContain("Back to Documents");
      expect(html).toContain("href=\"/documents\"");
    });

    it("DocumentProcessingState displays custom status label and filename", () => {
      const html = renderToString(
        <DocumentProcessingState status="extracting" filename="Contract.pdf" />
      );

      expect(html).toContain("Extracting…");
      expect(html).toContain("Contract.pdf");
      expect(html).toContain("Document is being processed");
    });

    it("DocumentErrorState filters out sensitive database leakages from errorMessage", () => {
      const sensitiveLeak =
        "FATAL: password authentication failed for postgres://admin:secret@db.internal at line 42";

      const html = renderToString(
        <DocumentErrorState filename="Lease.pdf" errorMessage={sensitiveLeak} />
      );

      expect(html).not.toContain("password");
      expect(html).not.toContain("secret");
      expect(html).not.toContain("postgres://");
      expect(html).not.toContain("db.internal");
      // Falls back to safe message
      expect(html).toContain("Failed to extract readable text from this document.");
    });
  });

  // =========================================================================
  // 7. Content Safety
  // =========================================================================
  describe("7. Content Safety", () => {
    it("renders document text containing HTML/script tags as escaped plain text", () => {
      const maliciousScript = "<script>alert('xss')</script>";
      const doc = createMockDocument();
      const sections: WorkspaceSection[] = [
        {
          id: "sec-xss",
          orderIndex: 0,
          sectionNumber: 0,
          title: "Terms",
          content: `Section text with ${maliciousScript} embedded.`,
          pageStart: 1,
          pageEnd: 1,
        },
      ];

      const html = renderToString(
        <DocumentViewer document={doc} sections={sections} />
      );

      // Must be HTML-escaped by React
      expect(html).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
      expect(html).not.toContain("<script>alert('xss')</script>");
    });
  });
});


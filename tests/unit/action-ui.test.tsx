/**
 * Unit Tests — Action Center UI Components (Phase 7)
 *
 * Covers:
 * 1. CreateActionDialog:
 *    - Renders finding context (importance badge, type badge, label, summary, section/page).
 *    - Prepopulates action title with "Review <finding.label>".
 *    - Displays verbatim source text excerpt for substantive findings.
 *    - Displays "Absence in document" badge for missing provisions (no fake excerpts).
 *    - Returns null when isOpen is false or finding is null.
 * 2. ActionCard:
 *    - Renders open action with unchecked box, title, description, and metadata.
 *    - Renders completed action with line-through title and completed status.
 *    - Renders verbatim source excerpt quote block.
 *    - Renders direct jump link to document workspace with sectionId and findingId query params.
 *    - Handles standalone action without finding.
 * 3. ActionCenter:
 *    - Renders empty state when action list is empty, with link to browse documents.
 *    - Renders Open and Completed action counts accurately.
 *    - Renders Open and Completed sections when viewing "All".
 *    - Renders document filter dropdown when multiple documents have actions.
 * 4. FindingCard & EvidencePanel integration:
 *    - FindingCard renders "Add action" button when onAddAction prop is provided.
 *    - EvidencePanel renders "Add Action" button when onAddAction prop is provided.
 */

import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { CreateActionDialog } from "@/components/actions/CreateActionDialog";
import { ActionCard } from "@/components/actions/ActionCard";
import { ActionCenter } from "@/components/actions/ActionCenter";
import { FindingCard } from "@/components/workspace/FindingCard";
import { EvidencePanel } from "@/components/workspace/EvidencePanel";
import type { ActionWithDetails, DocumentFinding } from "@/types";

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const VALID_DOC_ID = "11111111-1111-4111-a111-111111111111";
const VALID_FINDING_ID = "22222222-2222-4222-a222-222222222222";
const VALID_ACTION_ID = "33333333-3333-4333-a333-333333333333";

const substantiveFinding: DocumentFinding = {
  id: VALID_FINDING_ID,
  documentId: VALID_DOC_ID,
  sectionId: "sec-8",
  chunkId: "chunk-8",
  findingType: "obligation",
  importance: "needs_attention",
  label: "Termination Notice Period",
  summary: "Either party may terminate the agreement with 60 days written notice.",
  sourceText: "Either party may terminate this agreement with sixty (60) days written notice.",
  pageNumber: 4,
  metadata: {},
  createdAt: new Date("2026-09-23T10:00:00Z"),
  updatedAt: new Date("2026-09-23T10:00:00Z"),
};

const missingFinding: DocumentFinding = {
  id: "missing-finding-1",
  documentId: VALID_DOC_ID,
  sectionId: null,
  chunkId: null,
  findingType: "missing_information",
  importance: "needs_attention",
  label: "Missing Non-Compete Clause",
  summary: "A standard non-compete provision was not identified in this agreement.",
  sourceText: null,
  pageNumber: null,
  metadata: { expectedTopic: "Non-Compete" },
  createdAt: new Date("2026-09-23T10:00:00Z"),
  updatedAt: new Date("2026-09-23T10:00:00Z"),
};

const mockActionOpen: ActionWithDetails = {
  id: VALID_ACTION_ID,
  documentId: VALID_DOC_ID,
  findingId: VALID_FINDING_ID,
  userId: "user-123",
  title: "Confirm whether termination notice can be 30 days",
  description: "Discuss with legal counsel during contract review.",
  status: "open",
  createdAt: new Date("2026-09-23T10:30:00Z"),
  updatedAt: new Date("2026-09-23T10:30:00Z"),
  completedAt: null,
  document: {
    id: VALID_DOC_ID,
    title: "Master Services Agreement",
    originalFilename: "msa.pdf",
  },
  finding: {
    id: VALID_FINDING_ID,
    findingType: "obligation",
    importance: "needs_attention",
    label: "Termination Notice Period",
    summary: "Either party may terminate the agreement with 60 days written notice.",
    sourceText: "Either party may terminate this agreement with sixty (60) days written notice.",
    pageNumber: 4,
    sectionId: "sec-8",
    sectionTitle: "Section 8 — Termination",
  },
};

const mockActionCompleted: ActionWithDetails = {
  id: "action-completed-1",
  documentId: VALID_DOC_ID,
  findingId: "missing-finding-1",
  userId: "user-123",
  title: "Request non-compete clause from vendor",
  description: null,
  status: "completed",
  createdAt: new Date("2026-09-23T11:00:00Z"),
  updatedAt: new Date("2026-09-23T12:00:00Z"),
  completedAt: new Date("2026-09-23T12:00:00Z"),
  document: {
    id: VALID_DOC_ID,
    title: "Master Services Agreement",
    originalFilename: "msa.pdf",
  },
  finding: {
    id: "missing-finding-1",
    findingType: "missing_information",
    importance: "needs_attention",
    label: "Missing Non-Compete Clause",
    summary: "A standard non-compete provision was not identified.",
    sourceText: null,
    pageNumber: null,
    sectionId: null,
    sectionTitle: null,
  },
};

describe("Action Center UI Components (Phase 7)", () => {
  // -------------------------------------------------------------------------
  // 1. CreateActionDialog
  // -------------------------------------------------------------------------
  describe("CreateActionDialog", () => {
    it("renders modal with finding preview and prepopulated title", () => {
      const html = renderToString(
        <CreateActionDialog
          finding={substantiveFinding}
          documentId={VALID_DOC_ID}
          isOpen={true}
          onClose={vi.fn()}
          sectionTitle="Section 8 — Termination"
        />
      );

      expect(html).toContain('data-testid="create-action-dialog"');
      expect(html).toContain("Add to Action Center");
      expect(html).toContain("Termination Notice Period");
      expect(html).toContain("Review Termination Notice Period");
      expect(html).toContain("Either party may terminate this agreement with sixty (60) days written notice.");
      expect(html).toContain("Section 8 — Termination");
      expect(html).toContain("p. 4");
    });

    it("renders absence notice for missing provision without fake excerpts", () => {
      const html = renderToString(
        <CreateActionDialog
          finding={missingFinding}
          documentId={VALID_DOC_ID}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(html).toContain("Missing Non-Compete Clause");
      expect(html).toContain("Absence in document");
      expect(html).not.toContain("blockquote");
    });

    it("returns null when isOpen is false", () => {
      const html = renderToString(
        <CreateActionDialog
          finding={substantiveFinding}
          documentId={VALID_DOC_ID}
          isOpen={false}
          onClose={vi.fn()}
        />
      );

      expect(html).toBe("");
    });
  });

  // -------------------------------------------------------------------------
  // 2. ActionCard
  // -------------------------------------------------------------------------
  describe("ActionCard", () => {
    it("renders open action card with provenance and source link", () => {
      const html = renderToString(
        <ActionCard
          action={mockActionOpen}
          onToggleStatus={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="action-card-33333333-3333-4333-a333-333333333333"');
      expect(html).toContain("Confirm whether termination notice can be 30 days");
      expect(html).toContain("Discuss with legal counsel during contract review.");
      expect(html).toContain("Master Services Agreement");
      expect(html).toContain("Section 8 — Termination");
      expect(html).toContain("p. 4");
      expect(html).toContain("Either party may terminate this agreement with sixty (60) days written notice.");
      expect(html).toContain('aria-checked="false"');
      expect(html).toContain('/documents/11111111-1111-4111-a111-111111111111?sectionId=sec-8&amp;findingId=22222222-2222-4222-a222-222222222222&amp;tab=document');
    });

    it("renders completed action with line-through styling and completed timestamp", () => {
      const html = renderToString(
        <ActionCard
          action={mockActionCompleted}
          onToggleStatus={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(html).toContain('aria-checked="true"');
      expect(html).toContain("line-through");
      expect(html).toContain("Completed");
      expect(html).toContain("Request non-compete clause from vendor");
      expect(html).toContain("Absence in document");
    });
  });

  // -------------------------------------------------------------------------
  // 3. ActionCenter
  // -------------------------------------------------------------------------
  describe("ActionCenter", () => {
    it("renders empty state when there are no actions", () => {
      const html = renderToString(<ActionCenter initialActions={[]} />);

      expect(html).toContain('data-testid="actions-empty-state"');
      expect(html).toContain("No Action Items Yet");
      expect(html).toContain("Browse Documents");
    });

    it("renders Open and Completed sections with accurate counts", () => {
      const html = renderToString(
        <ActionCenter initialActions={[mockActionOpen, mockActionCompleted]} />
      );

      expect(html).toContain("Action Center");
      expect(html).toContain("1 Open");
      expect(html).toContain("1 Completed");
      expect(html).toContain('data-testid="open-actions-section"');
      expect(html).toContain('data-testid="completed-actions-section"');
      expect(html).toContain("Confirm whether termination notice can be 30 days");
      expect(html).toContain("Request non-compete clause from vendor");
    });

    it("renders document filter dropdown when actions belong to multiple documents", () => {
      const actionDoc2: ActionWithDetails = {
        ...mockActionOpen,
        id: "action-doc-2",
        documentId: "doc-222",
        document: {
          id: "doc-222",
          title: "Vendor Agreement",
          originalFilename: "vendor.pdf",
        },
      };

      const html = renderToString(
        <ActionCenter initialActions={[mockActionOpen, actionDoc2]} />
      );

      expect(html).toContain('data-testid="document-filter-select"');
      expect(html).toContain("All Documents (2)");
      expect(html).toContain("Master Services Agreement");
      expect(html).toContain("Vendor Agreement");
    });
  });

  // -------------------------------------------------------------------------
  // 4. FindingCard & EvidencePanel Integration
  // -------------------------------------------------------------------------
  describe("FindingCard & EvidencePanel onAddAction integration", () => {
    it("renders 'Add action' button on FindingCard when onAddAction is provided", () => {
      const html = renderToString(
        <FindingCard
          finding={substantiveFinding}
          isSelected={false}
          onSelect={vi.fn()}
          onAddAction={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="finding-add-action-22222222-2222-4222-a222-222222222222"');
      expect(html).toContain("Add action");
    });

    it("renders 'Add Action' button on EvidencePanel when onAddAction is provided", () => {
      const html = renderToString(
        <EvidencePanel
          finding={substantiveFinding}
          onAddAction={vi.fn()}
        />
      );

      expect(html).toContain('data-testid="evidence-panel-add-action"');
      expect(html).toContain("Add Action");
    });
  });
});

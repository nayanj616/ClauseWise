"use client";

import * as React from "react";
import { Sparkles, FileText, Search } from "lucide-react";
import type {
  DocumentWorkspaceData,
  DocumentFinding,
  ValidatedImportantSection,
  WorkspaceSection,
} from "@/types";
import { DocumentHeader } from "./DocumentHeader";
import { DocumentOverview } from "./DocumentOverview";
import { ImportantSections } from "./ImportantSections";
import { FindingList } from "./FindingList";
import { EvidencePanel } from "./EvidencePanel";
import { DocumentViewer } from "./DocumentViewer";
import { AttentionItemsSummary } from "./AttentionItemsSummary";
import { FormattedDatesList } from "./FormattedDatesList";
import { FormattedFinancialList } from "./FormattedFinancialList";
import {
  DocumentProcessingState,
  DocumentErrorState,
  EmptyContentState,
} from "./WorkspaceStates";
import { cn } from "@/lib/utils";

export interface DocumentWorkspaceProps {
  data: DocumentWorkspaceData;
  findings?: DocumentFinding[];
  className?: string;
  initialTab?: "analysis" | "document";
}

/**
 * Top-level Document Intelligence Workspace component (Phase 3 Slice 3.6).
 *
 * Implements the core principle: EVIDENCE → MEANING → ACTION.
 * - Meaning: Document type, structured facts (parties, governing law, jurisdiction, dates, financial terms), and findings.
 * - Evidence: Verified verbatim source text, section coordinates, and page numbers (without fake excerpts for missing information).
 * - Action: Contextual jump navigation to verbatim document sections.
 *
 * Switches strictly based on existing status model:
 * - ready with sections -> Intelligence Workspace
 * - ready with 0 sections -> EmptyContentState
 * - error -> DocumentErrorState
 * - all other existing statuses (queued, extracting, extracted, chunking, analyzing) -> DocumentProcessingState
 */
export function DocumentWorkspace({
  data,
  findings = [],
  className,
  initialTab = "analysis",
}: DocumentWorkspaceProps) {
  const { document, sections } = data;

  // Tab state: "analysis" (intelligence overview & findings) vs "document" (verbatim section text)
  const [activeTab, setActiveTab] = React.useState<"analysis" | "document">(initialTab);

  // Selected finding state
  const [selectedFindingId, setSelectedFindingId] = React.useState<string | null>(
    findings.length > 0 ? findings[0].id : null
  );

  // Selected section index state for document viewer
  const [selectedSectionIndex, setSelectedSectionIndex] = React.useState<number>(0);

  // Active evidence excerpt to highlight in DocumentViewer (Phase 4 Slice 4.3)
  const [activeEvidenceExcerpt, setActiveEvidenceExcerpt] = React.useState<string | null>(null);

  // Map sections by id for fast lookups
  const sectionsById = React.useMemo(() => {
    const map = new Map<string, WorkspaceSection>();
    for (const sec of sections) {
      map.set(sec.id, sec);
    }
    return map;
  }, [sections]);

  // Resolve currently selected finding
  const selectedFinding = React.useMemo(() => {
    if (!selectedFindingId) return findings[0] || null;
    return findings.find((f) => f.id === selectedFindingId) || findings[0] || null;
  }, [findings, selectedFindingId]);

  // Resolve section title for selected finding
  const selectedFindingSection = selectedFinding?.sectionId
    ? sectionsById.get(selectedFinding.sectionId)
    : undefined;
  const selectedFindingSectionTitle = selectedFindingSection
    ? selectedFindingSection.title || `Section ${selectedFindingSection.orderIndex + 1}`
    : undefined;

  // Resolve important sections from metadata
  const metadata = (document.metadata || {}) as Record<string, unknown>;
  const extraction = (metadata.extraction || {}) as Record<string, unknown>;
  const importantSections =
    (metadata.importantSections as ValidatedImportantSection[] | undefined) ||
    (extraction.importantSections as ValidatedImportantSection[] | undefined) ||
    [];

  // Navigation handler from finding to document viewer (Phase 4 Slice 4.3)
  const handleNavigateToEvidence = React.useCallback(
    (finding: DocumentFinding | null | undefined) => {
      if (!finding) return;

      // Invariant: Substantive finding with genuine evidence
      if (
        finding.findingType === "missing_information" ||
        !finding.sourceText ||
        !finding.sectionId
      ) {
        return;
      }

      // Identify target section
      const targetSection = sectionsById.get(finding.sectionId);
      if (!targetSection) {
        return;
      }

      // 1. Select the finding
      setSelectedFindingId(finding.id);

      // 2. Select target section
      setSelectedSectionIndex(targetSection.orderIndex);

      // 3. Set active evidence excerpt for highlighting
      setActiveEvidenceExcerpt(finding.sourceText);

      // 4. Switch to Document tab
      setActiveTab("document");
    },
    [sectionsById]
  );

  // Jump to section in document viewer handler (for ImportantSections)
  const handleJumpToSection = React.useCallback(
    (target: string | number | null) => {
      if (target === null || target === undefined) return;

      if (typeof target === "number") {
        const safeIdx = Math.max(0, Math.min(target, sections.length - 1));
        setSelectedSectionIndex(safeIdx);
        setActiveEvidenceExcerpt(null);
        setActiveTab("document");
      } else if (typeof target === "string") {
        const found = sectionsById.get(target);
        if (found) {
          setSelectedSectionIndex(found.orderIndex);
          setActiveEvidenceExcerpt(null);
          setActiveTab("document");
        }
      }
    },
    [sections.length, sectionsById]
  );

  // 1. Error state: render user-safe error message
  if (document.status === "error") {
    return (
      <DocumentErrorState
        filename={document.filename}
        errorMessage={document.errorMessage}
        className={className}
      />
    );
  }

  // 2. Processing state: any existing status other than ready
  if (document.status !== "ready") {
    return (
      <DocumentProcessingState
        filename={document.filename}
        status={document.status}
        className={className}
      />
    );
  }

  // 3. Ready state with zero sections: empty content fallback
  if (!sections || sections.length === 0) {
    return <EmptyContentState filename={document.filename} className={className} />;
  }

  // 4. Ready state with sections: render Intelligence Workspace
  return (
    <div
      className={cn("flex flex-col gap-6 animate-fade-in", className)}
      data-testid="document-workspace-viewer"
    >
      {/* Document Workspace Master Header */}
      <DocumentHeader
        document={document}
        sectionCount={sections.length}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        findingsCount={findings.length}
      />

      {/* Main Tab Panels */}
      {activeTab === "analysis" ? (
        <main
          id="panel-analysis"
          role="tabpanel"
          aria-labelledby="tab-analysis"
          className="space-y-8"
          data-testid="intelligence-analysis-panel"
        >
          {/* Section 1: Overview & Structured Metadata */}
          <DocumentOverview document={document} />

          {/* Section 2: Items Requiring Attention (Phase 4 Slice 4.4) */}
          <AttentionItemsSummary
            findings={findings}
            selectedFindingId={selectedFinding?.id || null}
            onSelectFinding={(f) => setSelectedFindingId(f.id)}
            onViewInDocument={handleNavigateToEvidence}
            sectionsById={sectionsById}
          />

          {/* Section 3: Important Dates & Financial Terms Grid (Phase 4 Slice 4.4) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <FormattedDatesList
              findings={findings}
              selectedFindingId={selectedFinding?.id || null}
              onSelectFinding={(f) => setSelectedFindingId(f.id)}
              onViewInDocument={handleNavigateToEvidence}
              sectionsById={sectionsById}
            />

            <FormattedFinancialList
              findings={findings}
              selectedFindingId={selectedFinding?.id || null}
              onSelectFinding={(f) => setSelectedFindingId(f.id)}
              onViewInDocument={handleNavigateToEvidence}
              sectionsById={sectionsById}
            />
          </div>

          {/* Section 4: Important Sections Highlighted */}
          {importantSections.length > 0 && (
            <ImportantSections
              importantSections={importantSections}
              onSelectSection={handleJumpToSection}
            />
          )}

          {/* Section 3: Findings & Evidence Master-Detail */}
          <section
            aria-label="Findings and Evidence"
            className="space-y-4 pt-2"
            data-testid="findings-and-evidence-section"
          >
            <div className="flex items-center justify-between gap-2 border-b pb-3">
              <div className="space-y-0.5">
                <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                  <Search size={18} className="text-primary" aria-hidden="true" />
                  <span>Document Findings & Grounded Evidence</span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Grounded analysis of obligations, key terms, attention items, and absent provisions.
                </p>
              </div>

              <span className="text-xs font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full shrink-0">
                {findings.length} {findings.length === 1 ? "finding" : "findings"}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Filterable Finding List */}
              <div className="lg:col-span-5 xl:col-span-5">
                <FindingList
                  findings={findings}
                  selectedFindingId={selectedFinding?.id || null}
                  onSelectFinding={(f) => setSelectedFindingId(f.id)}
                  onViewInDocument={handleNavigateToEvidence}
                  sectionsById={sectionsById}
                />
              </div>

              {/* Right Column: Grounded Evidence Panel */}
              <div className="lg:col-span-7 xl:col-span-7 lg:sticky lg:top-6">
                <EvidencePanel
                  finding={selectedFinding}
                  sectionTitle={selectedFindingSectionTitle}
                  onJumpToSection={handleJumpToSection}
                  onViewInDocument={handleNavigateToEvidence}
                />
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main
          id="panel-document"
          role="tabpanel"
          aria-labelledby="tab-document"
          data-testid="verbatim-document-panel"
        >
          {/* Full Verbatim Document Viewer */}
          <DocumentViewer
            document={document}
            sections={sections}
            selectedIndex={selectedSectionIndex}
            onSelectIndex={setSelectedSectionIndex}
            highlightExcerpt={activeEvidenceExcerpt}
            hideHeader
          />
        </main>
      )}

      {/* Legal Disclaimer Footer */}
      <footer className="text-center py-4 border-t text-xs text-muted-foreground mt-4">
        <p>
          ClauseWise provides document analysis for informational purposes only and is{" "}
          <strong className="font-semibold text-foreground/80">
            not a substitute for professional legal advice
          </strong>
          .
        </p>
      </footer>
    </div>
  );
}

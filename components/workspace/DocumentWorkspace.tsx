"use client";

import * as React from "react";
import { Sparkles, FileText, Search } from "lucide-react";
import type {
  DocumentWorkspaceData,
  DocumentFinding,
  ValidatedImportantSection,
  WorkspaceSection,
  QaCitation,
  AnswerQuestionResult,
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
import { AskPanel } from "./AskPanel";
import { CreateActionDialog } from "@/components/actions/CreateActionDialog";
import { ProfessionalPrepTab } from "@/components/prep/ProfessionalPrepTab";
import type { ProfessionalPrepData, ActionWithDetails, ActionStatus } from "@/types";
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
  initialTab?: "analysis" | "document" | "ask" | "prep";
  initialFindingId?: string | null;
  initialSectionId?: string | null;
  onAsk?: (documentId: string, question: string) => Promise<AnswerQuestionResult>;
  initialAskResult?: AnswerQuestionResult | null;
  initialPrepData?: ProfessionalPrepData | null;
  initialActions?: ActionWithDetails[];
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
  initialFindingId,
  initialSectionId,
  onAsk,
  initialAskResult,
  initialPrepData,
  initialActions,
}: DocumentWorkspaceProps) {
  const { document, sections } = data;

  // Tab state: "analysis" vs "document" vs "ask" vs "prep"
  const [activeTab, setActiveTab] = React.useState<
    "analysis" | "document" | "ask" | "prep"
  >(initialTab);

  // Selected finding state
  const [selectedFindingId, setSelectedFindingId] = React.useState<string | null>(
    initialFindingId || (findings.length > 0 ? findings[0].id : null)
  );

  // Selected section index state for document viewer
  const [selectedSectionIndex, setSelectedSectionIndex] = React.useState<number>(0);

  // Active evidence excerpt to highlight in DocumentViewer (Phase 4 Slice 4.3)
  const [activeEvidenceExcerpt, setActiveEvidenceExcerpt] = React.useState<string | null>(null);

  // Selected section context for Ask assistant (Phase 6 Contextual Assistant)
  const [activeContextSectionId, setActiveContextSectionId] = React.useState<string | null>(null);

  // Action creation state (Phase 7 Action Center)
  const [actionFindingToCreate, setActionFindingToCreate] =
    React.useState<DocumentFinding | null>(null);

  // Actions list state for review checklist
  const [actionsList, setActionsList] = React.useState<ActionWithDetails[]>(
    initialPrepData?.openActions || initialActions || []
  );

  React.useEffect(() => {
    if (initialPrepData?.openActions) {
      setActionsList(initialPrepData.openActions);
    } else if (initialActions) {
      setActionsList(initialActions);
    }
  }, [initialPrepData, initialActions]);

  const handleToggleActionStatus = React.useCallback(
    async (actionId: string, currentStatus: ActionStatus) => {
      const nextStatus = currentStatus === "open" ? "completed" : "open";
      setActionsList((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: nextStatus } : a))
      );

      try {
        const res = await fetch(`/api/actions/${actionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        if (!res.ok) {
          setActionsList((prev) =>
            prev.map((a) => (a.id === actionId ? { ...a, status: currentStatus } : a))
          );
        }
      } catch {
        setActionsList((prev) =>
          prev.map((a) => (a.id === actionId ? { ...a, status: currentStatus } : a))
        );
      }
    },
    []
  );

  // Map sections by id for fast lookups
  const sectionsById = React.useMemo(() => {
    const map = new Map<string, WorkspaceSection>();
    for (const sec of sections) {
      map.set(sec.id, sec);
    }
    return map;
  }, [sections]);

  // Inbound navigation handler: restore finding & section when navigating from Action Center
  React.useEffect(() => {
    if (initialFindingId) {
      const found = findings.find((f) => f.id === initialFindingId);
      if (found) {
        setSelectedFindingId(found.id);
        if (found.sectionId) {
          const sec = sectionsById.get(found.sectionId);
          if (sec) {
            setSelectedSectionIndex(sec.orderIndex);
          }
        }
        if (found.sourceText) {
          setActiveEvidenceExcerpt(found.sourceText);
        }
      }
    } else if (initialSectionId) {
      const sec = sectionsById.get(initialSectionId);
      if (sec) {
        setSelectedSectionIndex(sec.orderIndex);
      }
    }
  }, [initialFindingId, initialSectionId, findings, sectionsById]);

  // Handler for adding action from finding
  const handleAddAction = React.useCallback((finding: DocumentFinding) => {
    setActionFindingToCreate(finding);
  }, []);

  // Handler for "Ask about this section" from DocumentViewer
  const handleAskAboutSection = React.useCallback((sectionId: string) => {
    setActiveContextSectionId(sectionId);
    setActiveTab("ask");
  }, []);

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
  const metadata = React.useMemo(
    () => (document.metadata || {}) as Record<string, unknown>,
    [document.metadata]
  );
  const importantSections = React.useMemo(() => {
    const extraction = (metadata.extraction || {}) as Record<string, unknown>;
    return (
      (metadata.importantSections as ValidatedImportantSection[] | undefined) ||
      (extraction.importantSections as ValidatedImportantSection[] | undefined) ||
      []
    );
  }, [metadata]);

  // Assemble or adapt Professional Prep briefing data
  const prepDataToRender: ProfessionalPrepData = React.useMemo(() => {
    const openActions = actionsList.filter((a) => a.status === "open");
    const completedCount = actionsList.filter((a) => a.status === "completed").length;

    if (initialPrepData) {
      return {
        ...initialPrepData,
        openActions,
        completedActionsCount: completedCount,
      };
    }

    const docClassification = (metadata.classification || {}) as Record<string, unknown>;
    const isStatedType = docClassification.isStatedInText === true;
    const executiveSummary = (metadata.executiveSummary as string) || null;

    return {
      document: {
        id: document.id,
        filename: document.filename,
        documentType: document.documentType ?? (metadata.documentType as string) ?? null,
        isStatedType,
        parties:
          document.parties ??
          (Array.isArray(metadata.parties)
            ? (metadata.parties as Array<unknown>).map((p) =>
                typeof p === "string" ? { name: p, role: null } : (p as { name: string; role: string | null })
              )
            : null),
        governingLaw: document.governingLaw ?? (metadata.governingLaw as string) ?? null,
        jurisdiction: document.jurisdiction ?? (metadata.jurisdiction as string) ?? null,
        pageCount: document.pageCount ?? null,
        fileSizeBytes: document.fileSizeBytes,
        createdAt: document.createdAt ? new Date(document.createdAt) : new Date(),
        executiveSummary,
      },
      keyClauses: importantSections.map((is, i) => {
        const matchedSec = is.sectionId ? sectionsById.get(is.sectionId) : undefined;
        const orderIdx = typeof is.sectionOrderIndex === "number"
          ? is.sectionOrderIndex
          : matchedSec?.orderIndex ?? i;
        const fallbackSec = sections[orderIdx];
        return {
          sectionId: is.sectionId || fallbackSec?.id || "",
          orderIndex: orderIdx,
          sectionNumber: matchedSec?.sectionNumber ?? fallbackSec?.sectionNumber ?? orderIdx + 1,
          title: is.title || matchedSec?.title || fallbackSec?.title || `Section ${orderIdx + 1}`,
          pageStart: matchedSec?.pageStart ?? fallbackSec?.pageStart ?? null,
          pageEnd: matchedSec?.pageEnd ?? fallbackSec?.pageEnd ?? null,
          importanceReason: is.reason || undefined,
          verbatimExcerpt: matchedSec?.content ? matchedSec.content.slice(0, 300) : undefined,
        };
      }),
      findingsSummary: {
        attentionItems: findings.filter((f) => f.importance === "needs_attention"),
        ambiguitiesAndInconsistencies: findings.filter(
          (f) => f.findingType === "ambiguity" || f.findingType === "inconsistency"
        ),
        missingProvisions: findings.filter((f) => f.findingType === "missing_information"),
        obligationsAndTerms: findings.filter(
          (f) =>
            f.findingType === "obligation" ||
            f.findingType === "date" ||
            f.findingType === "financial_term" ||
            f.findingType === "key_term"
        ),
        totalFindingsCount: findings.length,
      },
      openActions,
      completedActionsCount: completedCount,
      userQuestions: [],
      clarificationQuestions: findings
        .filter(
          (f) =>
            f.findingType === "missing_information" ||
            f.findingType === "ambiguity" ||
            f.findingType === "inconsistency" ||
            f.importance === "needs_attention"
        )
        .map((f) => {
          let question = "";
          let category: "missing_provision" | "ambiguity" | "inconsistency" | "attention_item" = "attention_item";
          const sec = f.sectionId ? sectionsById.get(f.sectionId) : undefined;
          const secTitle = sec ? sec.title : "the document";

          if (f.findingType === "missing_information") {
            category = "missing_provision";
            const topic = (f.metadata?.expectedTopic as string) || f.label;
            question = `Discuss with counsel whether a standard provision regarding "${topic}" should be incorporated.`;
          } else if (f.findingType === "ambiguity") {
            category = "ambiguity";
            question = `Clarify the intended scope and legal interpretation of "${f.label}" in ${secTitle} with counsel.`;
          } else if (f.findingType === "inconsistency") {
            category = "inconsistency";
            question = `Review with counsel how the terms regarding "${f.label}" should be reconciled between affected provisions.`;
          } else {
            category = "attention_item";
            question = `Review the obligations and potential implications of "${f.label}" in ${secTitle} with counsel.`;
          }

          return {
            id: `cq-${f.id}`,
            question,
            category,
            findingId: f.id,
            sectionId: f.sectionId,
            sectionTitle: sec ? sec.title : null,
            pageNumber: f.pageNumber,
            sourceText: f.sourceText,
            catalogTopic: (f.metadata?.expectedTopic as string) || null,
          };
        }),
      generatedAt: new Date(),
    };
  }, [initialPrepData, actionsList, document, metadata, importantSections, sectionsById, sections, findings]);

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

  // Navigation handler from QA citation to document viewer (Phase 5 Slice 5.3)
  const handleNavigateToCitation = React.useCallback(
    (citation: QaCitation | null | undefined) => {
      if (!citation) return;

      // 1. Identify and select target section if present
      if (citation.sectionId) {
        const targetSection = sectionsById.get(citation.sectionId);
        if (targetSection) {
          setSelectedSectionIndex(targetSection.orderIndex);
        }
      }

      // 2. Set active evidence excerpt for highlighting
      if (citation.sourceText) {
        setActiveEvidenceExcerpt(citation.sourceText);
      }

      // 3. Switch to Document tab
      setActiveTab("document");
    },
    [sectionsById]
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
        openActionsCount={prepDataToRender.openActions.length}
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
            onAddAction={handleAddAction}
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
                  onAddAction={handleAddAction}
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
                  onAddAction={handleAddAction}
                />
              </div>
            </div>
          </section>
        </main>
      ) : activeTab === "document" ? (
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
            onAskAboutSection={handleAskAboutSection}
            hideHeader
          />
        </main>
      ) : activeTab === "ask" ? (
        <main
          id="panel-ask"
          role="tabpanel"
          aria-labelledby="tab-ask"
          data-testid="document-ask-panel"
        >
          <AskPanel
            documentId={document.id}
            documentTitle={document.filename}
            sectionsById={sectionsById}
            sections={sections}
            activeSectionId={activeContextSectionId}
            onSelectContextSectionId={setActiveContextSectionId}
            onNavigateToCitation={handleNavigateToCitation}
            onAsk={onAsk}
            initialResult={initialAskResult}
          />
        </main>
      ) : (
        <main
          id="panel-prep"
          role="tabpanel"
          aria-labelledby="tab-prep"
          data-testid="professional-prep-panel"
        >
          <ProfessionalPrepTab
            data={prepDataToRender}
            sectionsById={sectionsById}
            onSelectSection={handleJumpToSection}
            onViewInDocument={handleNavigateToEvidence}
            onToggleActionStatus={handleToggleActionStatus}
            onOpenAskTab={() => setActiveTab("ask")}
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

      {/* Create Action Modal (Phase 7 Action Center) */}
      {actionFindingToCreate && (
        <CreateActionDialog
          finding={actionFindingToCreate}
          documentId={document.id}
          isOpen={!!actionFindingToCreate}
          onClose={() => setActionFindingToCreate(null)}
          sectionTitle={
            actionFindingToCreate.sectionId
              ? sectionsById.get(actionFindingToCreate.sectionId)?.title
              : undefined
          }
        />
      )}
    </div>
  );
}

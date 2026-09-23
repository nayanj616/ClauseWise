"use client";

import * as React from "react";
import { Briefcase } from "lucide-react";
import { PrepDisclaimerBanner, PrepDisclaimerFooter } from "./PrepDisclaimerBanner";
import { PrepExportControls } from "./PrepExportControls";
import { PrepDocumentOverview } from "./PrepDocumentOverview";
import { PrepKeyClauses } from "./PrepKeyClauses";
import { PrepFindingsReview } from "./PrepFindingsReview";
import { PrepOpenActions } from "./PrepOpenActions";
import { PrepQuestionsForCounsel } from "./PrepQuestionsForCounsel";
import { PrepUserQuestions } from "./PrepUserQuestions";
import { formatBriefingAsMarkdown } from "@/lib/prep/markdown-export";
import { cn } from "@/lib/utils";
import type {
  ProfessionalPrepData,
  ClarificationQuestion,
  DocumentFinding,
  WorkspaceSection,
  ActionWithDetails,
  ActionStatus,
} from "@/types";

export interface ProfessionalPrepTabProps {
  data: ProfessionalPrepData;
  sectionsById?: Map<string, WorkspaceSection>;
  onSelectSection?: (orderIndex: number) => void;
  onViewInDocument?: (finding: DocumentFinding) => void;
  onToggleActionStatus?: (actionId: string, currentStatus: ActionStatus) => Promise<void>;
  onOpenAskTab?: () => void;
  className?: string;
}

export function ProfessionalPrepTab({
  data,
  sectionsById,
  onSelectSection,
  onViewInDocument,
  onToggleActionStatus,
  onOpenAskTab,
  className,
}: ProfessionalPrepTabProps) {
  // Handler for Copy Markdown export
  const handleCopyMarkdown = React.useCallback(async () => {
    const markdown = formatBriefingAsMarkdown(data);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(markdown);
    }
  }, [data]);

  // Handler for jumping from an action's finding to document viewer
  const handleViewActionEvidence = React.useCallback(
    (action: ActionWithDetails) => {
      if (action.finding && onViewInDocument) {
        onViewInDocument(action.finding as unknown as DocumentFinding);
      }
    },
    [onViewInDocument]
  );

  // Handler for jumping from a counsel question to document viewer
  const handleViewQuestionEvidence = React.useCallback(
    (question: ClarificationQuestion) => {
      if (question.sourceText && question.sectionId && onViewInDocument) {
        const syntheticFinding: DocumentFinding = {
          id: question.findingId || question.id,
          documentId: data.document.id,
          sectionId: question.sectionId,
          chunkId: null,
          findingType: "attention",
          importance: "needs_attention",
          label: question.question,
          summary: question.question,
          sourceText: question.sourceText,
          pageNumber: question.pageNumber ?? null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        onViewInDocument(syntheticFinding);
      }
    },
    [data.document.id, onViewInDocument]
  );

  return (
    <div
      className={cn("space-y-6 animate-fade-in", className)}
      data-testid="professional-prep-tab"
    >
      {/* Header Bar & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Briefcase size={22} className="text-primary" aria-hidden="true" />
            <span>Professional Legal Briefing</span>
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Structured consultation package assembled from verified clauses, findings, and review checklists.
          </p>
        </div>

        {/* Export Controls (Copy & Print) */}
        <PrepExportControls onCopyMarkdown={handleCopyMarkdown} />
      </div>

      {/* Prominent Legal Advice Disclaimer Banner */}
      <PrepDisclaimerBanner />

      {/* 1. Document Profile & Metadata */}
      <PrepDocumentOverview document={data.document} />

      {/* 2. Key Clauses & Core Provisions */}
      <PrepKeyClauses
        keyClauses={data.keyClauses}
        onSelectSection={onSelectSection}
      />

      {/* 3. Document Findings Review */}
      <PrepFindingsReview
        findingsSummary={data.findingsSummary}
        sectionsById={sectionsById}
        onViewInDocument={onViewInDocument}
      />

      {/* 4. Open Action Checklist (Phase 7 Integration) */}
      <PrepOpenActions
        actions={data.openActions}
        completedCount={data.completedActionsCount}
        onToggleStatus={onToggleActionStatus}
        onViewActionEvidence={handleViewActionEvidence}
      />

      {/* 5. Questions for Counsel (Discussion Prompts) */}
      <PrepQuestionsForCounsel
        questions={data.clarificationQuestions}
        onViewQuestionEvidence={handleViewQuestionEvidence}
      />

      {/* 6. Questions Explored During Review (User Questions from Q&A) */}
      <PrepUserQuestions
        userQuestions={data.userQuestions}
        onOpenAskTab={onOpenAskTab}
      />

      {/* Disclaimer Footer */}
      <PrepDisclaimerFooter />
    </div>
  );
}

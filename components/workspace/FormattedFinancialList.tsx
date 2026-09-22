"use client";

import * as React from "react";
import { DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FindingCard } from "./FindingCard";
import { cn } from "@/lib/utils";
import type { DocumentFinding, WorkspaceSection } from "@/types";

export interface FormattedFinancialListProps {
  findings: DocumentFinding[];
  selectedFindingId?: string | null;
  onSelectFinding?: (finding: DocumentFinding) => void;
  onViewInDocument?: (finding: DocumentFinding) => void;
  sectionsById?: Map<string, WorkspaceSection>;
  className?: string;
}

/**
 * Financial Terms List Component (Phase 4 Slice 4.4)
 *
 * Surfaces findings whose findingType is 'financial_term'.
 * Displays formatted currency/amount/frequency and provides evidence-backed navigation.
 */
export function FormattedFinancialList({
  findings,
  selectedFindingId,
  onSelectFinding,
  onViewInDocument,
  sectionsById,
  className,
}: FormattedFinancialListProps) {
  // Filter for financial_term findingType
  const financialFindings = React.useMemo(() => {
    return findings.filter((f) => f.findingType === "financial_term");
  }, [findings]);

  return (
    <section
      aria-label="Financial Terms"
      className={cn("space-y-4", className)}
      data-testid="formatted-financial-section"
    >
      <div className="flex items-center justify-between gap-2 border-b pb-3">
        <div className="space-y-0.5">
          <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>Financial Terms</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Compensation, payment schedules, penalty clauses, and financial obligations detected in the document text.
          </p>
        </div>

        <Badge variant="outline" className="text-xs font-semibold text-muted-foreground bg-muted/60">
          {`${financialFindings.length} ${financialFindings.length === 1 ? "term" : "terms"}`}
        </Badge>
      </div>

      {financialFindings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="list">
          {financialFindings.map((finding) => {
            const section = finding.sectionId && sectionsById
              ? sectionsById.get(finding.sectionId)
              : undefined;
            const sectionTitle = section
              ? section.title || `Section ${section.orderIndex + 1}`
              : undefined;

            return (
              <FindingCard
                key={finding.id}
                finding={finding}
                isSelected={finding.id === selectedFindingId}
                onSelect={() => onSelectFinding?.(finding)}
                onViewInDocument={onViewInDocument}
                sectionTitle={sectionTitle}
              />
            );
          })}
        </div>
      ) : (
        <div
          className="rounded-xl border border-dashed p-6 text-center bg-card text-muted-foreground space-y-1.5"
          data-testid="formatted-financial-empty"
        >
          <p className="text-sm font-semibold text-foreground">
            No Financial Terms Identified
          </p>
          <p className="text-xs max-w-sm mx-auto">
            No explicit fees, payment amounts, or compensation structures were identified in this document.
          </p>
        </div>
      )}
    </section>
  );
}

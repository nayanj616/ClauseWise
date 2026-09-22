"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FindingCard } from "./FindingCard";
import { cn } from "@/lib/utils";
import type { DocumentFinding, WorkspaceSection } from "@/types";

export interface AttentionItemsSummaryProps {
  findings: DocumentFinding[];
  selectedFindingId?: string | null;
  onSelectFinding?: (finding: DocumentFinding) => void;
  onViewInDocument?: (finding: DocumentFinding) => void;
  sectionsById?: Map<string, WorkspaceSection>;
  className?: string;
}

/**
 * Attention Items Summary Section (Phase 4 Slice 4.4)
 *
 * Surfaces findings whose importance is 'needs_attention'.
 * Reuses the canonical FindingCard and Phase 4.3 onViewInDocument navigation callback.
 */
export function AttentionItemsSummary({
  findings,
  selectedFindingId,
  onSelectFinding,
  onViewInDocument,
  sectionsById,
  className,
}: AttentionItemsSummaryProps) {
  // Filter for needs_attention importance
  const attentionFindings = React.useMemo(() => {
    return findings.filter((f) => f.importance === "needs_attention");
  }, [findings]);

  return (
    <section
      aria-label="Items Requiring Attention"
      className={cn("space-y-4", className)}
      data-testid="attention-items-section"
    >
      <div className="flex items-center justify-between gap-2 border-b pb-3">
        <div className="space-y-0.5">
          <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" aria-hidden="true" />
            <span>Items Requiring Attention</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Critical clauses, immediate obligations, and absent standard provisions requiring user review.
          </p>
        </div>

        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 text-xs font-semibold"
        >
          {`${attentionFindings.length} ${attentionFindings.length === 1 ? "item" : "items"}`}
        </Badge>
      </div>

      {attentionFindings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="list">
          {attentionFindings.map((finding) => {
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
          data-testid="attention-items-empty"
        >
          <p className="text-sm font-semibold text-foreground">
            No Items Requiring Attention
          </p>
          <p className="text-xs max-w-sm mx-auto">
            No high-priority obligations, urgent risks, or critical provisions requiring immediate attention were identified.
          </p>
        </div>
      )}
    </section>
  );
}

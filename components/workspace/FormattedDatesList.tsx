"use client";

import * as React from "react";
import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FindingCard } from "./FindingCard";
import { cn } from "@/lib/utils";
import type { DocumentFinding, WorkspaceSection } from "@/types";

export interface FormattedDatesListProps {
  findings: DocumentFinding[];
  selectedFindingId?: string | null;
  onSelectFinding?: (finding: DocumentFinding) => void;
  onViewInDocument?: (finding: DocumentFinding) => void;
  sectionsById?: Map<string, WorkspaceSection>;
  className?: string;
}

/**
 * Important Dates List Component (Phase 4 Slice 4.4)
 *
 * Surfaces findings whose findingType is 'date'.
 * Displays formatted date values and provides evidence-backed navigation.
 */
export function FormattedDatesList({
  findings,
  selectedFindingId,
  onSelectFinding,
  onViewInDocument,
  sectionsById,
  className,
}: FormattedDatesListProps) {
  // Filter for date findingType
  const dateFindings = React.useMemo(() => {
    return findings.filter((f) => f.findingType === "date");
  }, [findings]);

  return (
    <section
      aria-label="Important Dates"
      className={cn("space-y-4", className)}
      data-testid="formatted-dates-section"
    >
      <div className="flex items-center justify-between gap-2 border-b pb-3">
        <div className="space-y-0.5">
          <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <Calendar size={18} className="text-primary" aria-hidden="true" />
            <span>Important Dates</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Effective dates, notice periods, milestones, and expiration terms identified in the document text.
          </p>
        </div>

        <Badge variant="outline" className="text-xs font-semibold text-muted-foreground bg-muted/60">
          {`${dateFindings.length} ${dateFindings.length === 1 ? "date" : "dates"}`}
        </Badge>
      </div>

      {dateFindings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" role="list">
          {dateFindings.map((finding) => {
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
          data-testid="formatted-dates-empty"
        >
          <p className="text-sm font-semibold text-foreground">
            No Important Dates Identified
          </p>
          <p className="text-xs max-w-sm mx-auto">
            No specific deadlines, terms, effective dates, or expiration milestones were detected in this document.
          </p>
        </div>
      )}
    </section>
  );
}

"use client";

import * as React from "react";
import { Filter, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  DocumentFinding,
  FindingImportance,
  FindingType,
  WorkspaceSection,
} from "@/types";
import { FindingCard, FINDING_TYPE_DISPLAY_LABELS } from "./FindingCard";

export interface FindingListProps {
  findings: DocumentFinding[];
  selectedFindingId: string | null;
  onSelectFinding: (finding: DocumentFinding) => void;
  onViewInDocument?: (finding: DocumentFinding) => void;
  onAddAction?: (finding: DocumentFinding) => void;
  sectionsById?: Map<string, WorkspaceSection>;
  className?: string;
}

export function FindingList({
  findings,
  selectedFindingId,
  onSelectFinding,
  onViewInDocument,
  onAddAction,
  sectionsById,
  className,
}: FindingListProps) {
  const [importanceFilter, setImportanceFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");

  // Determine unique types present in the findings
  const availableTypes = React.useMemo(() => {
    const types = new Set<string>();
    for (const f of findings) {
      types.add(f.findingType);
    }
    return Array.from(types);
  }, [findings]);

  // Counts by importance
  const counts = React.useMemo(() => {
    const map = {
      all: findings.length,
      needs_attention: 0,
      important: 0,
      informational: 0,
    };
    for (const f of findings) {
      if (f.importance === "needs_attention") map.needs_attention++;
      else if (f.importance === "important") map.important++;
      else if (f.importance === "informational") map.informational++;
    }
    return map;
  }, [findings]);

  // Filtered findings list
  const filteredFindings = React.useMemo(() => {
    return findings.filter((f) => {
      if (importanceFilter !== "all" && f.importance !== importanceFilter) {
        return false;
      }
      if (typeFilter !== "all" && f.findingType !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [findings, importanceFilter, typeFilter]);

  // Empty State 1: Zero findings for document
  if (findings.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed p-8 text-center bg-card text-muted-foreground space-y-2",
          className
        )}
        data-testid="findings-empty-state"
      >
        <p className="text-base font-semibold text-foreground">
          No Findings Identified
        </p>
        <p className="text-sm max-w-sm mx-auto">
          No substantive findings, obligations, or missing provisions were detected in this document.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)} data-testid="findings-list-container">
      {/* Filter Controls Bar */}
      <div className="space-y-2.5 bg-card border rounded-xl p-3.5 shadow-sm">
        {/* Importance Filter Pills */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Filter size={13} aria-hidden="true" />
            Filter by Importance
          </span>

          <span className="text-xs text-muted-foreground">
            {filteredFindings.length} of {findings.length} findings
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            type="button"
            variant={importanceFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setImportanceFilter("all")}
            className="h-7 text-xs px-2.5 rounded-full"
            data-testid="filter-importance-all"
          >
            {`All (${counts.all})`}
          </Button>

          {counts.needs_attention > 0 && (
            <Button
              type="button"
              variant={importanceFilter === "needs_attention" ? "default" : "outline"}
              size="sm"
              onClick={() => setImportanceFilter("needs_attention")}
              className="h-7 text-xs px-2.5 rounded-full"
              data-testid="filter-importance-needs-attention"
            >
              {`Needs Attention (${counts.needs_attention})`}
            </Button>
          )}

          {counts.important > 0 && (
            <Button
              type="button"
              variant={importanceFilter === "important" ? "default" : "outline"}
              size="sm"
              onClick={() => setImportanceFilter("important")}
              className="h-7 text-xs px-2.5 rounded-full"
              data-testid="filter-importance-important"
            >
              {`Important (${counts.important})`}
            </Button>
          )}

          {counts.informational > 0 && (
            <Button
              type="button"
              variant={importanceFilter === "informational" ? "default" : "outline"}
              size="sm"
              onClick={() => setImportanceFilter("informational")}
              className="h-7 text-xs px-2.5 rounded-full"
              data-testid="filter-importance-informational"
            >
              {`Informational (${counts.informational})`}
            </Button>
          )}
        </div>

        {/* Type Filter Pills (if multiple types exist) */}
        {availableTypes.length > 1 && (
          <div className="pt-2 border-t border-border/50 flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground font-medium mr-1">
              Type:
            </span>

            <Button
              type="button"
              variant={typeFilter === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setTypeFilter("all")}
              className="h-6 text-[11px] px-2 py-0"
              data-testid="filter-type-all"
            >
              All Types
            </Button>

            {availableTypes.map((typeKey) => (
              <Button
                key={typeKey}
                type="button"
                variant={typeFilter === typeKey ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTypeFilter(typeKey)}
                className="h-6 text-[11px] px-2 py-0"
                data-testid={`filter-type-${typeKey}`}
              >
                {FINDING_TYPE_DISPLAY_LABELS[typeKey as FindingType] || typeKey}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Findings Cards List */}
      {filteredFindings.length > 0 ? (
        <div className="space-y-3" role="feed" aria-label="Document Findings">
          {filteredFindings.map((finding) => {
            const isSelected = finding.id === selectedFindingId;
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
                isSelected={isSelected}
                onSelect={() => onSelectFinding(finding)}
                onViewInDocument={onViewInDocument}
                onAddAction={onAddAction}
                sectionTitle={sectionTitle}
              />
            );
          })}
        </div>
      ) : (
        <div
          className="rounded-xl border border-dashed p-6 text-center bg-card text-muted-foreground space-y-2"
          data-testid="findings-filtered-empty"
        >
          <p className="text-sm font-semibold text-foreground">
            No Findings Match Filter
          </p>
          <p className="text-xs">
            Try selecting a different importance level or finding type.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setImportanceFilter("all");
              setTypeFilter("all");
            }}
            className="text-xs h-7"
          >
            Reset Filters
          </Button>
        </div>
      )}
    </div>
  );
}

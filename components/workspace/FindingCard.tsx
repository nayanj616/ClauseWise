"use client";

import * as React from "react";
import {
  AlertTriangle,
  Info,
  CheckCircle2,
  FileQuestion,
  MapPin,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  DocumentFinding,
  FindingType,
  FindingImportance,
} from "@/types";

export interface FindingCardProps {
  finding: DocumentFinding;
  isSelected: boolean;
  onSelect: () => void;
  sectionTitle?: string;
  className?: string;
}

export const FINDING_TYPE_DISPLAY_LABELS: Record<FindingType, string> = {
  key_term: "Key Term",
  attention: "Attention Item",
  obligation: "Obligation",
  ambiguity: "Ambiguity",
  date: "Key Date",
  financial_term: "Financial Term",
  inconsistency: "Inconsistency",
  missing_information: "Missing Provision",
};

export const IMPORTANCE_CONFIG: Record<
  FindingImportance,
  { label: string; badgeClass: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  needs_attention: {
    label: "Needs Attention",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
    icon: AlertTriangle,
  },
  important: {
    label: "Important",
    badgeClass: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
    icon: Info,
  },
  informational: {
    label: "Informational",
    badgeClass: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700",
    icon: CheckCircle2,
  },
};

export function FindingCard({
  finding,
  isSelected,
  onSelect,
  sectionTitle,
  className,
}: FindingCardProps) {
  const typeLabel = FINDING_TYPE_DISPLAY_LABELS[finding.findingType as FindingType] || finding.findingType;
  const importanceInfo = IMPORTANCE_CONFIG[finding.importance as FindingImportance] || IMPORTANCE_CONFIG.informational;
  const ImportanceIcon = importanceInfo.icon;
  const isMissing = finding.findingType === "missing_information";

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-all flex flex-col justify-between gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected
          ? "border-primary bg-primary/[0.04] shadow-sm ring-1 ring-primary/30"
          : "border-border/80 bg-card hover:bg-muted/40 hover:border-border",
        className
      )}
      data-testid={`finding-card-${finding.id}`}
    >
      <div className="space-y-2 w-full">
        {/* Badges Bar: Importance + Finding Type */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={cn("gap-1 py-0.5 px-2 text-[11px] font-semibold", importanceInfo.badgeClass)}
            >
              <ImportanceIcon size={12} aria-hidden="true" />
              <span>{importanceInfo.label}</span>
            </Badge>

            <Badge variant="outline" className="text-[11px] px-2 py-0.5 text-muted-foreground font-normal">
              {typeLabel}
            </Badge>
          </div>

          <ChevronRight
            size={16}
            className={cn(
              "text-muted-foreground transition-transform shrink-0",
              isSelected ? "text-primary translate-x-0.5" : "group-hover:translate-x-0.5"
            )}
            aria-hidden="true"
          />
        </div>

        {/* Title / Label */}
        <h4 className="font-semibold text-sm text-foreground break-words leading-snug">
          {finding.label}
        </h4>

        {/* Summary Description */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {finding.summary}
        </p>
      </div>

      {/* Location / Provenance Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50 w-full">
        {isMissing ? (
          <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
            <FileQuestion size={12} aria-hidden="true" />
            <span>Absence in document</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 truncate" title={sectionTitle || "Referenced Section"}>
            <MapPin size={12} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            <span className="truncate">{sectionTitle || "Section"}</span>
          </span>
        )}

        {!isMissing && typeof finding.pageNumber === "number" && finding.pageNumber > 0 && (
          <span className="font-mono text-muted-foreground shrink-0 pl-2">
            {`p. ${finding.pageNumber}`}
          </span>
        )}
      </div>
    </button>
  );
}

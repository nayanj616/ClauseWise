"use client";

import * as React from "react";
import {
  AlertTriangle,
  Info,
  CheckCircle2,
  FileQuestion,
  MapPin,
  ChevronRight,
  ArrowRight,
  Calendar,
  DollarSign,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatFindingDate, formatFinancialTerm } from "@/lib/utils";
import type {
  DocumentFinding,
  FindingType,
  FindingImportance,
} from "@/types";

export interface FindingCardProps {
  finding: DocumentFinding;
  isSelected: boolean;
  onSelect: () => void;
  onViewInDocument?: (finding: DocumentFinding) => void;
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
  onViewInDocument,
  sectionTitle,
  className,
}: FindingCardProps) {
  const typeLabel = FINDING_TYPE_DISPLAY_LABELS[finding.findingType as FindingType] || finding.findingType;
  const importanceInfo = IMPORTANCE_CONFIG[finding.importance as FindingImportance] || IMPORTANCE_CONFIG.informational;
  const ImportanceIcon = importanceInfo.icon;
  const isMissing = finding.findingType === "missing_information";

  // Resolve specific date and financial metadata
  const metadata = (finding.metadata || {}) as Record<string, unknown>;
  const rawDate = typeof metadata.dateValue === "string" ? metadata.dateValue : null;
  const dateDescription = typeof metadata.dateDescription === "string" ? metadata.dateDescription : null;
  const formattedDate = formatFindingDate(rawDate);

  const rawAmount = typeof metadata.amount === "string" ? metadata.amount : null;
  const currency = typeof metadata.currency === "string" ? metadata.currency : null;
  const frequency = typeof metadata.frequency === "string" ? metadata.frequency : null;
  const formattedFinancial = formatFinancialTerm(rawAmount, currency, frequency);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-all flex flex-col justify-between gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer select-none",
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

        {/* Formatted Date Metadata if present */}
        {formattedDate && (
          <div
            className="flex items-center gap-1.5 text-xs font-semibold text-foreground bg-muted/60 px-2 py-1 rounded w-fit"
            data-testid={`finding-date-badge-${finding.id}`}
          >
            <Calendar size={13} className="text-primary shrink-0" aria-hidden="true" />
            <span>{formattedDate}</span>
            {dateDescription && dateDescription !== formattedDate && (
              <span className="text-[11px] text-muted-foreground font-normal">
                • {dateDescription}
              </span>
            )}
          </div>
        )}

        {/* Formatted Financial Metadata if present */}
        {formattedFinancial && (
          <div
            className="flex items-center gap-1.5 text-xs font-semibold text-foreground bg-muted/60 px-2 py-1 rounded w-fit"
            data-testid={`finding-financial-badge-${finding.id}`}
          >
            <DollarSign size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span>{formattedFinancial}</span>
          </div>
        )}
      </div>

      {/* Location / Provenance Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50 w-full gap-2">
        {isMissing ? (
          <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
            <FileQuestion size={12} aria-hidden="true" />
            <span>Absence in document</span>
          </span>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex items-center gap-1 truncate" title={sectionTitle || "Referenced Section"}>
              <MapPin size={12} aria-hidden="true" className="shrink-0 text-muted-foreground" />
              <span className="truncate">{sectionTitle || "Section"}</span>
            </span>
            {typeof finding.pageNumber === "number" && finding.pageNumber > 0 && (
              <span className="font-mono text-muted-foreground shrink-0">
                {`• p. ${finding.pageNumber}`}
              </span>
            )}
          </div>
        )}

        {/* View in Document action for substantive findings with evidence */}
        {!isMissing && finding.sourceText && finding.sectionId && onViewInDocument && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewInDocument(finding);
            }}
            className="h-6 text-[11px] text-primary hover:text-primary hover:bg-primary/10 px-2 py-0 gap-1 font-medium shrink-0"
            aria-label={`View finding "${finding.label}" in document`}
            data-testid={`finding-view-in-doc-${finding.id}`}
          >
            <span>View in document</span>
            <ArrowRight size={11} aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

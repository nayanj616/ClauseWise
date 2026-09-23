"use client";

import * as React from "react";
import {
  AlertTriangle,
  HelpCircle,
  FileQuestion,
  CheckCircle2,
  ArrowRight,
  Quote,
  Clock,
  DollarSign,
  Briefcase,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FINDING_TYPE_DISPLAY_LABELS,
  IMPORTANCE_CONFIG,
} from "@/components/workspace/FindingCard";
import { cn } from "@/lib/utils";
import type { DocumentFinding, WorkspaceSection } from "@/types";
import type { ProfessionalPrepData } from "@/lib/services/preparation-service";

export interface PrepFindingsReviewProps {
  findingsSummary: ProfessionalPrepData["findingsSummary"];
  sectionsById?: Map<string, WorkspaceSection>;
  onViewInDocument?: (finding: DocumentFinding) => void;
  className?: string;
}

export function PrepFindingsReview({
  findingsSummary,
  sectionsById,
  onViewInDocument,
  className,
}: PrepFindingsReviewProps) {
  const {
    attentionItems,
    ambiguitiesAndInconsistencies,
    missingProvisions,
    obligationsAndTerms,
  } = findingsSummary;

  const renderFindingCard = (finding: DocumentFinding) => {
    const isMissing = finding.findingType === "missing_information";
    const section = finding.sectionId && sectionsById
      ? sectionsById.get(finding.sectionId)
      : undefined;
    const sectionTitle = section
      ? section.title || `Section ${section.orderIndex + 1}`
      : undefined;

    const importanceMeta = IMPORTANCE_CONFIG[finding.importance];
    const typeLabel =
      FINDING_TYPE_DISPLAY_LABELS[finding.findingType] || finding.findingType;

    return (
      <div
        key={finding.id}
        className={cn(
          "rounded-lg border p-3.5 transition-colors flex flex-col justify-between gap-2.5",
          finding.importance === "needs_attention"
            ? "border-amber-300/80 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20"
            : "border-border/70 bg-card"
        )}
        data-testid={`prep-finding-card-${finding.id}`}
      >
        <div className="space-y-2">
          {/* Top badges */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge
                variant="outline"
                className={cn("text-[10px] py-0 px-2 font-medium", importanceMeta?.badgeClass)}
              >
                {importanceMeta?.label || finding.importance}
              </Badge>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">
                {typeLabel}
              </Badge>
            </div>

            {finding.pageNumber && (
              <span className="text-[10px] text-muted-foreground font-medium">
                Page {finding.pageNumber}
              </span>
            )}
          </div>

          {/* Finding Label & Summary */}
          <div>
            <h4 className="text-xs sm:text-sm font-semibold text-foreground">
              {finding.label}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              {finding.summary}
            </p>
          </div>

          {/* Evidence Quote or Missing Information Notice */}
          {isMissing ? (
            <div className="rounded border border-dashed border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40 p-2 text-xs text-amber-900 dark:text-amber-300">
              <span className="font-semibold block text-[10px] uppercase tracking-wider">
                Absent Standard Provision
              </span>
              <span className="text-[11px] opacity-90">
                This document lacks standard language for this provision according to the core provision catalog.
              </span>
            </div>
          ) : finding.sourceText ? (
            <blockquote className="rounded bg-muted/50 border-l-2 border-primary/50 p-2 text-xs text-foreground/90 italic">
              &ldquo;{finding.sourceText.trim()}&rdquo;
              {sectionTitle && (
                <span className="block not-italic text-[10px] text-muted-foreground mt-1 font-medium">
                  — {sectionTitle}
                </span>
              )}
            </blockquote>
          ) : null}
        </div>

        {/* Source Navigation Button */}
        {!isMissing && finding.sourceText && onViewInDocument && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onViewInDocument(finding)}
            className="gap-1.5 self-start text-xs h-7 px-2 text-primary hover:text-primary hover:bg-primary/10 print:hidden"
            aria-label={`View evidence for ${finding.label} in document text`}
          >
            <span>View Source Excerpt</span>
            <ArrowRight size={13} aria-hidden="true" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <Card
      className={cn("border-border shadow-xs space-y-6 p-5 sm:p-6", className)}
      data-testid="prep-findings-review"
    >
      <div>
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2 text-foreground">
            <AlertTriangle size={18} className="text-amber-500" aria-hidden="true" />
            <span>Document Findings for Legal Review</span>
          </span>
          <Badge variant="outline" className="text-xs">
            {findingsSummary.totalFindingsCount} total
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Grounded findings organized by review priority, ambiguity, and absent provisions.
        </p>
      </div>

      {/* 1. Items Requiring Special Attention */}
      {attentionItems.length > 0 && (
        <section aria-label="Items Requiring Special Attention" className="space-y-3">
          <div className="flex items-center justify-between border-b pb-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-500" aria-hidden="true" />
              <span>Priority Attention Items ({attentionItems.length})</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {attentionItems.map(renderFindingCard)}
          </div>
        </section>
      )}

      {/* 2. Absent Standard Provisions */}
      {missingProvisions.length > 0 && (
        <section aria-label="Absent Standard Provisions" className="space-y-3">
          <div className="flex items-center justify-between border-b pb-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <FileQuestion size={14} className="text-amber-600" aria-hidden="true" />
              <span>Absent Standard Provisions ({missingProvisions.length})</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {missingProvisions.map(renderFindingCard)}
          </div>
        </section>
      )}

      {/* 3. Ambiguities & Inconsistencies */}
      {ambiguitiesAndInconsistencies.length > 0 && (
        <section aria-label="Ambiguities and Inconsistencies" className="space-y-3">
          <div className="flex items-center justify-between border-b pb-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <HelpCircle size={14} className="text-sky-600" aria-hidden="true" />
              <span>Ambiguities & Conflicting Terms ({ambiguitiesAndInconsistencies.length})</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {ambiguitiesAndInconsistencies.map(renderFindingCard)}
          </div>
        </section>
      )}

      {/* 4. Obligations & Key Terms */}
      {obligationsAndTerms.length > 0 && (
        <section aria-label="Key Obligations and Terms" className="space-y-3">
          <div className="flex items-center justify-between border-b pb-1.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-primary" aria-hidden="true" />
              <span>Key Obligations & Core Terms ({obligationsAndTerms.length})</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {obligationsAndTerms.map(renderFindingCard)}
          </div>
        </section>
      )}
    </Card>
  );
}

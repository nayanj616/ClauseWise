"use client";

import * as React from "react";
import { GitCompare, FileText, Layers, PlusCircle, MinusCircle, Edit3, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DocumentComparisonResult } from "@/types";

export interface ComparisonSummaryCardProps {
  comparison: DocumentComparisonResult;
  className?: string;
}

export function ComparisonSummaryCard({
  comparison,
  className,
}: ComparisonSummaryCardProps) {
  const { documentA, documentB, summary } = comparison;

  return (
    <Card className={cn("border-border shadow-xs", className)} data-testid="comparison-summary-card">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
            <GitCompare size={18} className="text-primary" aria-hidden="true" />
            <span>Comparison Summary</span>
          </CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5" data-testid="stat-total-diffs">
              {summary.totalDifferences} difference{summary.totalDifferences === 1 ? "" : "s"} identified
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Document comparison identity banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Document A Card */}
          <div className="rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-3 space-y-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1 uppercase tracking-wider text-[10px]">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-200 dark:bg-blue-800 text-[10px] font-bold">
                  A
                </span>
                <span>Base Document</span>
              </span>
              {documentA.pageCount && (
                <span className="text-[10px] text-muted-foreground">{documentA.pageCount} pages</span>
              )}
            </div>
            <h4 className="font-semibold text-sm text-foreground truncate" title={documentA.title}>
              {documentA.title}
            </h4>
            <p className="text-muted-foreground text-[11px]">
              {documentA.documentType || "Unclassified"}
            </p>
          </div>

          {/* Document B Card */}
          <div className="rounded-lg border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20 p-3 space-y-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1 uppercase tracking-wider text-[10px]">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-purple-200 dark:bg-purple-800 text-[10px] font-bold">
                  B
                </span>
                <span>Comparison Document</span>
              </span>
              {documentB.pageCount && (
                <span className="text-[10px] text-muted-foreground">{documentB.pageCount} pages</span>
              )}
            </div>
            <h4 className="font-semibold text-sm text-foreground truncate" title={documentB.title}>
              {documentB.title}
            </h4>
            <p className="text-muted-foreground text-[11px]">
              {documentB.documentType || "Unclassified"}
            </p>
          </div>
        </div>

        {/* Counter Breakdown Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
          <div className="rounded-md border border-blue-200/80 bg-blue-50/30 dark:border-blue-900/40 dark:bg-blue-950/10 p-2.5 space-y-0.5">
            <div className="flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400">
              <Edit3 size={13} aria-hidden="true" />
              <span className="text-[11px] font-medium">Modified</span>
            </div>
            <p className="text-base font-bold text-foreground" data-testid="count-modified">
              <span data-testid="stat-modified">{summary.modifiedCount}</span>
            </p>
          </div>

          <div className="rounded-md border border-emerald-200/80 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10 p-2.5 space-y-0.5">
            <div className="flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400">
              <PlusCircle size={13} aria-hidden="true" />
              <span className="text-[11px] font-medium">Added in B</span>
            </div>
            <p className="text-base font-bold text-foreground" data-testid="count-added">
              <span data-testid="stat-added">{summary.addedCount}</span>
            </p>
          </div>

          <div className="rounded-md border border-amber-200/80 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10 p-2.5 space-y-0.5">
            <div className="flex items-center justify-center gap-1 text-amber-600 dark:text-amber-400">
              <MinusCircle size={13} aria-hidden="true" />
              <span className="text-[11px] font-medium">Removed in B</span>
            </div>
            <p className="text-base font-bold text-foreground" data-testid="count-removed">
              <span data-testid="stat-removed">{summary.removedCount}</span>
            </p>
          </div>

          <div className="rounded-md border border-muted/80 bg-muted/20 p-2.5 space-y-0.5">
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <CheckCircle2 size={13} aria-hidden="true" />
              <span className="text-[11px] font-medium">Unchanged</span>
            </div>
            <p className="text-base font-bold text-foreground" data-testid="count-unchanged">
              <span data-testid="stat-unchanged">{summary.unchangedCount}</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


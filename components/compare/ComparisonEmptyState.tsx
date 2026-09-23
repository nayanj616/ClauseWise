"use client";

import * as React from "react";
import Link from "next/link";
import { GitCompare, Upload, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ComparisonEmptyStateType =
  | "fewer_than_two_docs"
  | "no_selection"
  | "identical_selection"
  | "unready_docs";

export interface ComparisonEmptyStateProps {
  type: ComparisonEmptyStateType;
  message?: string;
  className?: string;
}

export function ComparisonEmptyState({
  type,
  message,
  className,
}: ComparisonEmptyStateProps) {
  if (type === "fewer_than_two_docs") {
    return (
      <Card
        className={cn("border-dashed p-8 sm:p-12 text-center", className)}
        data-testid="compare-empty-fewer-than-two"
      >
        <CardContent className="flex flex-col items-center justify-center p-0 space-y-3.5 max-w-md mx-auto">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload size={24} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Upload at least two documents
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Side-by-side comparison requires two uploaded legal documents. Upload agreements, NDAs, or contracts to compare their terms.
            </p>
          </div>
          <Button asChild size="sm" className="gap-2 mt-2">
            <Link href="/documents">
              <Upload size={14} aria-hidden="true" />
              <span>Go to Documents</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (type === "identical_selection") {
    return (
      <Card
        className={cn("border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-8 text-center", className)}
        data-testid="compare-empty-identical"
      >
        <CardContent className="flex flex-col items-center justify-center p-0 space-y-2.5 max-w-md mx-auto">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
            <AlertCircle size={22} aria-hidden="true" />
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-foreground">
            Identical Documents Selected
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {message || "Cannot compare a document with itself. Please select two distinct agreements to view differences."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (type === "unready_docs") {
    return (
      <Card
        className={cn("border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 p-8 text-center", className)}
        data-testid="compare-empty-unready"
      >
        <CardContent className="flex flex-col items-center justify-center p-0 space-y-2.5 max-w-md mx-auto">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
            <Clock size={22} aria-hidden="true" />
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-foreground">
            Document Still Processing
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {message || "One or both selected documents are still extracting or being analyzed. Please wait for processing to complete before comparing."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Default: no_selection
  return (
    <Card
      className={cn("border-dashed p-8 sm:p-12 text-center", className)}
      data-testid="compare-empty-no-selection"
    >
      <CardContent className="flex flex-col items-center justify-center p-0 space-y-3 max-w-md mx-auto">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <GitCompare size={24} aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">
            Select Two Documents to Compare
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Choose a base document (Document A) and a comparison document (Document B) using the selectors above to view side-by-side differences.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}


"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, PlusCircle, MinusCircle, Edit3, CheckCircle2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SectionDifferenceItem } from "@/types";

export interface DifferenceCardProps {
  diff: SectionDifferenceItem;
  documentAId: string;
  documentBId: string;
  className?: string;
}

export function DifferenceCard({
  diff,
  documentAId,
  documentBId,
  className,
}: DifferenceCardProps) {
  const getBadgeMeta = () => {
    switch (diff.differenceType) {
      case "added":
        return {
          label: "Added in Document B",
          className: "border-emerald-300 text-emerald-800 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40",
          icon: PlusCircle,
        };
      case "removed":
        return {
          label: "Removed in Document B",
          className: "border-amber-300 text-amber-800 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-950/40",
          icon: MinusCircle,
        };
      case "modified":
        return {
          label: "Wording Modified",
          className: "border-blue-300 text-blue-800 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-950/40",
          icon: Edit3,
        };
      case "unchanged":
        return {
          label: "Unchanged",
          className: "border-border text-muted-foreground bg-muted/40",
          icon: CheckCircle2,
        };
    }
  };

  const meta = getBadgeMeta();
  const Icon = meta.icon;

  const docALink = diff.sectionAId
    ? `/documents/${documentAId}?tab=document&sectionId=${diff.sectionAId}${
        diff.findingAId ? `&findingId=${diff.findingAId}` : ""
      }`
    : null;

  const docBLink = diff.sectionBId
    ? `/documents/${documentBId}?tab=document&sectionId=${diff.sectionBId}${
        diff.findingBId ? `&findingId=${diff.findingBId}` : ""
      }`
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 sm:p-5 transition-colors space-y-3.5 bg-card",
        diff.differenceType === "modified" && "border-blue-200/80 dark:border-blue-900/60",
        diff.differenceType === "added" && "border-emerald-200/80 dark:border-emerald-900/60",
        diff.differenceType === "removed" && "border-amber-200/80 dark:border-amber-900/60",
        diff.differenceType === "unchanged" && "border-border/70",
        className
      )}
      data-testid={`diff-card-${diff.id}`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={cn("text-[11px] py-0.5 px-2.5 font-medium flex items-center gap-1", meta.className)}
          data-testid={`diff-badge-${diff.differenceType}`}
        >
          <Icon size={12} aria-hidden="true" />
          <span>{meta.label}</span>
        </Badge>

        {diff.changeSummary && (
          <span className="text-[11px] text-muted-foreground font-medium">
            {diff.changeSummary}
          </span>
        )}
      </div>

      {/* Title & Description */}
      <div>
        <h4 className="text-sm sm:text-base font-semibold text-foreground">
          {diff.title}
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
          {diff.description}
        </p>
      </div>

      {/* Side-by-Side Evidence Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Document A Column */}
        <div className="rounded-md border border-border/80 bg-muted/20 p-3 space-y-2 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
              <span className="flex items-center gap-1">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-200 dark:bg-blue-850 text-[9px] font-bold">
                  A
                </span>
                <span>Document A</span>
              </span>
              {diff.sectionAPageStart && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  Page {diff.sectionAPageStart}
                  {diff.sectionAPageEnd && diff.sectionAPageEnd !== diff.sectionAPageStart
                    ? `–${diff.sectionAPageEnd}`
                    : ""}
                </span>
              )}
            </div>

            {diff.sectionATitle && (
              <p className="text-xs font-medium text-foreground truncate">
                {diff.sectionATitle}
              </p>
            )}

            {diff.excerptA ? (
              <blockquote className="rounded bg-background border-l-2 border-blue-400 p-2 text-xs text-foreground/90 italic font-serif">
                &ldquo;{diff.excerptA}&rdquo;
              </blockquote>
            ) : (
              <div className="rounded border border-dashed border-muted p-3 text-center text-xs text-muted-foreground italic">
                Clause absent from Document A
              </div>
            )}
          </div>

          {docALink && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="gap-1 self-start text-xs h-7 px-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 print:hidden mt-2"
              data-testid={`diff-view-doc-a-${diff.id}`}
            >
              <Link href={docALink} target="_blank" rel="noopener noreferrer">
                <span>View in Document A</span>
                <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>

        {/* Document B Column */}
        <div className="rounded-md border border-border/80 bg-muted/20 p-3 space-y-2 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-purple-700 dark:text-purple-300">
              <span className="flex items-center gap-1">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-purple-200 dark:bg-purple-850 text-[9px] font-bold">
                  B
                </span>
                <span>Document B</span>
              </span>
              {diff.sectionBPageStart && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  Page {diff.sectionBPageStart}
                  {diff.sectionBPageEnd && diff.sectionBPageEnd !== diff.sectionBPageStart
                    ? `–${diff.sectionBPageEnd}`
                    : ""}
                </span>
              )}
            </div>

            {diff.sectionBTitle && (
              <p className="text-xs font-medium text-foreground truncate">
                {diff.sectionBTitle}
              </p>
            )}

            {diff.excerptB ? (
              <blockquote className="rounded bg-background border-l-2 border-purple-400 p-2 text-xs text-foreground/90 italic font-serif">
                &ldquo;{diff.excerptB}&rdquo;
              </blockquote>
            ) : (
              <div className="rounded border border-dashed border-muted p-3 text-center text-xs text-muted-foreground italic">
                Clause absent from Document B
              </div>
            )}
          </div>

          {docBLink && (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="gap-1 self-start text-xs h-7 px-2 text-purple-600 hover:text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 print:hidden mt-2"
              data-testid={`diff-view-doc-b-${diff.id}`}
            >
              <Link href={docBLink} target="_blank" rel="noopener noreferrer">
                <span>View in Document B</span>
                <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


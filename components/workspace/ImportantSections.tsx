"use client";

import * as React from "react";
import { Bookmark, ArrowRight, Layers } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ValidatedImportantSection } from "@/types";

export interface ImportantSectionsProps {
  importantSections?: (
    | ValidatedImportantSection
    | {
        sectionId?: string;
        sectionOrderIndex?: number;
        orderIndex?: number;
        sectionNumber?: number;
        title: string;
        reason?: string;
      }
  )[];
  onSelectSection?: (orderIndex: number) => void;
  className?: string;
}

export function ImportantSections({
  importantSections = [],
  onSelectSection,
  className,
}: ImportantSectionsProps) {
  if (importantSections.length === 0) {
    return null;
  }

  return (
    <Card
      className={cn("border-border shadow-sm", className)}
      data-testid="important-sections-container"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2 text-foreground">
            <Bookmark size={18} className="text-primary" aria-hidden="true" />
            <span>Key Sections Highlighted</span>
          </span>
          <Badge variant="outline" className="text-xs font-normal">
            {importantSections.length} {importantSections.length === 1 ? "section" : "sections"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {importantSections.map((sec, idx) => {
            const rawOrderIndex =
              typeof sec.sectionOrderIndex === "number" && Number.isFinite(sec.sectionOrderIndex)
                ? sec.sectionOrderIndex
                : typeof (sec as { orderIndex?: number }).orderIndex === "number" &&
                  Number.isFinite((sec as { orderIndex?: number }).orderIndex)
                ? (sec as { orderIndex?: number }).orderIndex!
                : typeof (sec as { sectionNumber?: number }).sectionNumber === "number" &&
                  Number.isFinite((sec as { sectionNumber?: number }).sectionNumber)
                ? (sec as { sectionNumber?: number }).sectionNumber! - 1
                : idx;

            const sectionDisplayNum =
              typeof (sec as { sectionNumber?: number }).sectionNumber === "number" &&
              Number.isFinite((sec as { sectionNumber?: number }).sectionNumber)
                ? (sec as { sectionNumber?: number }).sectionNumber!
                : rawOrderIndex + 1;

            return (
              <div
                key={`${sec.sectionId || rawOrderIndex}-${idx}`}
                className="rounded-lg border border-border/70 p-3.5 bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col justify-between space-y-2.5"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                      {`Section ${sectionDisplayNum}`}
                    </Badge>
                  </div>
                  <h4 className="font-semibold text-sm text-foreground break-words">
                    {sec.title}
                  </h4>
                  {sec.reason && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {sec.reason}
                    </p>
                  )}
                </div>

                {onSelectSection && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectSection(rawOrderIndex)}
                    className="gap-1.5 self-start text-xs h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
                    aria-label={`Jump to ${sec.title} in document text`}
                  >
                    <span>View in Document Text</span>
                    <ArrowRight size={13} aria-hidden="true" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

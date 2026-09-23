"use client";

import * as React from "react";
import { Bookmark, ArrowRight, FileText } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KeyClauseItem } from "@/lib/services/preparation-service";

export interface PrepKeyClausesProps {
  keyClauses: KeyClauseItem[];
  onSelectSection?: (orderIndex: number) => void;
  className?: string;
}

export function PrepKeyClauses({
  keyClauses,
  onSelectSection,
  className,
}: PrepKeyClausesProps) {
  if (keyClauses.length === 0) {
    return null;
  }

  return (
    <Card
      className={cn("border-border shadow-xs", className)}
      data-testid="prep-key-clauses"
    >
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
            <Bookmark size={18} className="text-primary" aria-hidden="true" />
            <span>Key Clauses & Core Provisions</span>
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {keyClauses.length} {keyClauses.length === 1 ? "clause" : "clauses"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {keyClauses.map((clause, idx) => (
            <div
              key={`${clause.sectionId}-${idx}`}
              className="rounded-lg border border-border/70 p-4 bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col justify-between gap-3"
              data-testid={`prep-key-clause-${idx}`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {clause.sectionNumber
                      ? `Section ${clause.sectionNumber}`
                      : `Section ${clause.orderIndex + 1}`}
                  </Badge>

                  {clause.pageStart && (
                    <span className="text-[10px] text-muted-foreground font-medium">
                      Page {clause.pageStart}
                      {clause.pageEnd && clause.pageEnd !== clause.pageStart
                        ? `–${clause.pageEnd}`
                        : ""}
                    </span>
                  )}
                </div>

                <h4 className="font-semibold text-sm text-foreground break-words">
                  {clause.title}
                </h4>

                {clause.importanceReason && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground/80 font-medium">Why it matters: </strong>
                    {clause.importanceReason}
                  </p>
                )}

                {clause.verbatimExcerpt && (
                  <blockquote className="border-l-2 border-primary/40 pl-2.5 my-1 text-xs text-muted-foreground italic line-clamp-3">
                    &ldquo;{clause.verbatimExcerpt}&rdquo;
                  </blockquote>
                )}
              </div>

              {onSelectSection && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectSection(clause.orderIndex)}
                  className="gap-1.5 self-start text-xs h-7 px-2 text-primary hover:text-primary hover:bg-primary/10 print:hidden"
                  aria-label={`Jump to ${clause.title} in document text`}
                  data-testid={`prep-clause-view-src-${clause.sectionId}`}
                >
                  <span>View in Document Text</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import * as React from "react";
import { HelpCircle, ArrowRight, Scale, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClarificationQuestion } from "@/lib/services/preparation-service";
import type { DocumentFinding } from "@/types";

export interface PrepQuestionsForCounselProps {
  questions: ClarificationQuestion[];
  onViewQuestionEvidence?: (question: ClarificationQuestion) => void;
  className?: string;
}

const CATEGORY_LABELS: Record<ClarificationQuestion["category"], { label: string; variant: "outline" | "secondary" | "destructive" | "informational" }> = {
  missing_provision: { label: "Absent Provision Inquiry", variant: "outline" },
  ambiguity: { label: "Ambiguity Clarification", variant: "informational" },
  inconsistency: { label: "Reconciliation Topic", variant: "secondary" },
  attention_item: { label: "Priority Clause Review", variant: "outline" },
};

export function PrepQuestionsForCounsel({
  questions,
  onViewQuestionEvidence,
  className,
}: PrepQuestionsForCounselProps) {
  return (
    <Card
      className={cn("border-border shadow-xs", className)}
      data-testid="prep-questions-for-counsel"
    >
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
            <Scale size={18} className="text-primary" aria-hidden="true" />
            <span>Suggested Questions for Legal Counsel</span>
          </CardTitle>

          <Badge variant="outline" className="text-xs">
            {questions.length} {questions.length === 1 ? "prompt" : "prompts"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Objective discussion prompts derived deterministically from document ambiguities, absent standard clauses, and high-priority obligations. These are inquiry prompts to explore with an attorney, not legal conclusions.
        </p>
      </CardHeader>

      <CardContent className="pt-4">
        {questions.length > 0 ? (
          <div className="space-y-3" role="list">
            {questions.map((q, idx) => {
              const catMeta = CATEGORY_LABELS[q.category] || {
                label: "Discussion Topic",
                variant: "outline",
              };

              return (
                <div
                  key={q.id || idx}
                  className="rounded-lg border border-border/70 p-4 bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col justify-between gap-3"
                  data-testid={`prep-counsel-question-${idx}`}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge
                        variant={catMeta.variant}
                        className="text-[10px] py-0 px-2 font-medium"
                      >
                        {catMeta.label}
                      </Badge>

                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                        {q.sectionTitle && <span>{q.sectionTitle}</span>}
                        {q.pageNumber && (
                          <span>• Page {q.pageNumber}</span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm font-semibold text-foreground leading-relaxed">
                      {q.question}
                    </p>

                    {q.sourceText && (
                      <blockquote className="rounded bg-muted/40 border-l-2 border-primary/40 px-2.5 py-1 text-[11px] text-muted-foreground italic line-clamp-2">
                        &ldquo;{q.sourceText.trim()}&rdquo;
                      </blockquote>
                    )}
                  </div>

                  {q.sourceText && onViewQuestionEvidence && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewQuestionEvidence(q)}
                      className="gap-1.5 self-start text-xs h-7 px-2 text-primary hover:text-primary hover:bg-primary/10 print:hidden"
                      aria-label={`View evidence for question "${q.question}" in document text`}
                    >
                      <span>View Relevant Section</span>
                      <ArrowRight size={13} aria-hidden="true" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className="rounded-lg border border-dashed p-6 text-center text-muted-foreground space-y-1.5"
            data-testid="prep-questions-for-counsel-empty"
          >
            <AlertCircle size={24} className="mx-auto text-primary/60 mb-1" aria-hidden="true" />
            <p className="text-xs sm:text-sm font-semibold text-foreground">
              No Specific Clarification Prompts Generated
            </p>
            <p className="text-xs max-w-sm mx-auto">
              No significant ambiguities, conflicting clauses, or absent standard provisions were identified for this document.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

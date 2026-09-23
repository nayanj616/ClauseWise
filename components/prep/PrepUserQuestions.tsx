"use client";

import * as React from "react";
import { MessageSquare, Calendar, HelpCircle, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserRecordedQuestion } from "@/lib/services/conversation-service";

export interface PrepUserQuestionsProps {
  userQuestions: UserRecordedQuestion[];
  onOpenAskTab?: () => void;
  className?: string;
}

export function PrepUserQuestions({
  userQuestions,
  onOpenAskTab,
  className,
}: PrepUserQuestionsProps) {
  return (
    <Card
      className={cn("border-border shadow-xs", className)}
      data-testid="prep-user-questions"
    >
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
            <MessageSquare size={18} className="text-primary" aria-hidden="true" />
            <span>Questions Explored During Review</span>
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {userQuestions.length} {userQuestions.length === 1 ? "question" : "questions"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {userQuestions.length > 0 ? (
          <div className="space-y-2.5" role="list">
            {userQuestions.map((q, idx) => (
              <div
                key={q.id || idx}
                className="rounded-lg border border-border/70 p-3 bg-muted/20 hover:bg-muted/40 transition-colors flex items-start justify-between gap-3"
                data-testid={`prep-user-question-${idx}`}
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-foreground leading-snug">
                    &ldquo;{q.question}&rdquo;
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Calendar size={11} aria-hidden="true" />
                    <span>{new Date(q.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="rounded-lg border border-dashed p-6 text-center text-muted-foreground space-y-1.5"
            data-testid="prep-user-questions-empty"
          >
            <HelpCircle size={24} className="mx-auto text-primary/60 mb-1" aria-hidden="true" />
            <p className="text-xs sm:text-sm font-semibold text-foreground">
              No Document Questions Recorded Yet
            </p>
            <p className="text-xs max-w-sm mx-auto">
              Any questions you ask in the Ask panel will automatically appear here as part of your legal consultation preparation.
            </p>
            {onOpenAskTab && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenAskTab}
                className="mt-2 text-xs h-8 gap-1.5 print:hidden"
              >
                <span>Ask a question in Ask tab</span>
                <ArrowRight size={12} aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import * as React from "react";
import {
  Sparkles,
  Search,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  FileQuestion,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { askDocumentQuestionApi } from "@/lib/qa/qa-client";
import type {
  AnswerQuestionResult,
  QaCitation,
  WorkspaceSection,
} from "@/types";

export interface AskPanelProps {
  documentId: string;
  documentTitle?: string;
  sectionsById?: Map<string, WorkspaceSection>;
  onNavigateToCitation?: (citation: QaCitation) => void;
  /** Custom ask function for testing or mock environments. Defaults to askDocumentQuestionApi */
  onAsk?: (documentId: string, question: string) => Promise<AnswerQuestionResult>;
  /** Optional initial result to render */
  initialResult?: AnswerQuestionResult | null;
  className?: string;
}

const STARTER_QUESTIONS = [
  "What are the termination conditions and notice periods?",
  "What are the payment terms and invoice dispute deadlines?",
  "What is the governing law and dispute resolution mechanism?",
  "What are the key obligations and responsibilities of the parties?",
];

/**
 * Document Q&A Panel — ClauseWise (Phase 5 Slice 5.3)
 *
 * Implements the document-scoped "Ask" experience:
 * User question → answerQuestion() → Grounded Answer → Citations → Document Highlighting.
 *
 * Invariants:
 * 1. Strict Grounded Treatment Gate:
 *    A result is treated as grounded ONLY when:
 *    hasSufficientEvidence === true && isGrounded === true && citationValidationPassed === true && citations.length > 0.
 * 2. Unverified Citations:
 *    If citationValidationPassed === false or citations.length === 0, the answer is flagged as unverified.
 * 3. Insufficient Evidence:
 *    If hasSufficientEvidence === false, an explicit refusal banner is shown. Zero fabrication.
 * 4. Citation Privacy / Safety:
 *    Raw similarity scores are stripped from the user interface (no numerical legal risk scoring).
 * 5. Actionable Evidence:
 *    Each citation links to the verbatim section in DocumentViewer with exact excerpt highlighting.
 */
export function AskPanel({
  documentId,
  documentTitle,
  sectionsById,
  onNavigateToCitation,
  onAsk,
  initialResult = null,
  className,
}: AskPanelProps) {
  const [question, setQuestion] = React.useState<string>("");
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AnswerQuestionResult | null>(initialResult);

  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const handleAsk = React.useCallback(
    async (questionToAsk: string) => {
      const trimmed = questionToAsk.trim();
      if (!trimmed || isLoading) return;

      setIsLoading(true);
      setError(null);

      const askFn = onAsk || askDocumentQuestionApi;

      try {
        const response = await askFn(documentId, trimmed);
        setResult(response);
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "An unexpected error occurred while analyzing the document.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [documentId, isLoading, onAsk]
  );

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    void handleAsk(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleAsk(question);
    }
  };

  const handleSelectStarter = (starterText: string) => {
    setQuestion(starterText);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Evaluate result grounding conditions
  const hasSufficientEvidence = result?.hasSufficientEvidence === true;
  const isGrounded = result?.isGrounded === true;
  const citationValidationPassed = result?.citationValidationPassed === true;
  const hasCitations = Array.isArray(result?.citations) && result.citations.length > 0;

  // Strict invariant: Only grounded if all conditions hold and citations.length > 0
  const isGroundedSuccess =
    hasSufficientEvidence &&
    isGrounded &&
    citationValidationPassed &&
    hasCitations;

  const isInsufficientEvidence = result !== null && !hasSufficientEvidence;

  const isCitationFailure =
    result !== null &&
    hasSufficientEvidence &&
    (!citationValidationPassed || !hasCitations);

  return (
    <div
      className={cn("space-y-6 animate-fade-in", className)}
      data-testid="ask-panel-container"
    >
      {/* 1. Question Input Header Card */}
      <section
        className="rounded-xl border bg-card p-5 sm:p-6 shadow-sm space-y-4"
        aria-label="Ask a question about this document"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <Sparkles size={18} className="text-primary" aria-hidden="true" />
              <span>Ask ClauseWise</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {documentTitle
                ? `Ask questions grounded in the verified text of ${documentTitle}.`
                : "Ask questions grounded in verified document evidence."}
            </p>
          </div>

          <Badge variant="outline" className="text-xs gap-1 py-1">
            <Search size={12} aria-hidden="true" />
            <span>Document-Grounded</span>
          </Badge>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <textarea
              ref={inputRef}
              id="ask-question-input"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              maxLength={2000}
              placeholder="E.g., What are the confidentiality obligations and exceptions? What is the governing law?"
              aria-label="Question about document"
              className={cn(
                "w-full rounded-lg border bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 resize-y min-h-[80px]",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-muted-foreground">
              {question.length}/2000 characters • Press Enter to submit, Shift+Enter for new line
            </span>

            <Button
              type="submit"
              disabled={!question.trim() || isLoading}
              className="gap-2 font-medium"
              data-testid="ask-submit-button"
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  <span>Searching Evidence…</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} aria-hidden="true" />
                  <span>Ask Question</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </section>

      {/* 2. Loading State */}
      {isLoading && (
        <section
          aria-live="polite"
          className="rounded-xl border border-dashed bg-card/50 p-8 sm:p-10 text-center space-y-4 animate-pulse shadow-sm"
          data-testid="ask-loading-state"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 size={24} className="animate-spin" aria-hidden="true" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-base font-semibold text-foreground">
              Retrieving Evidence & Formulating Answer
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Searching document chunks with vector similarity, checking evidence sufficiency, and generating a verified answer…
            </p>
          </div>
        </section>
      )}

      {/* 3. Error State */}
      {!isLoading && error && (
        <section
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6 space-y-3 shadow-sm"
          data-testid="ask-error-state"
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-destructive shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-destructive">
                Unable to complete question analysis
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {error}
              </p>
            </div>
          </div>
          <div className="pt-1 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleAsk(question)}
              className="text-xs gap-1.5"
            >
              <span>Retry</span>
            </Button>
          </div>
        </section>
      )}

      {/* 4. Results & Answer Views */}
      {!isLoading && !error && result && (
        <div className="space-y-6">
          {/* 4a. Insufficient Evidence Banner */}
          {isInsufficientEvidence && (
            <section
              aria-label="Insufficient evidence warning"
              className="rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20 p-5 sm:p-6 space-y-3 shadow-sm"
              data-testid="insufficient-evidence-banner"
            >
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                      Insufficient Document Evidence
                    </h3>
                    <Badge variant="attention" className="text-[10px] py-0">
                      Grounded Refusal
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground/90 font-medium leading-relaxed">
                    {result.answer}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                    ClauseWise strictly refuses to guess or introduce outside legal assumptions when document evidence is absent.
                    Try asking about a topic explicitly addressed in the document text.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* 4b. Citation Validation Failure Banner */}
          {isCitationFailure && (
            <section
              aria-label="Unverified answer warning"
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6 space-y-3 shadow-sm"
              data-testid="unverified-citations-banner"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-destructive shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-destructive">
                      Unverified Answer — Citations Missing or Discredited
                    </h3>
                    <Badge variant="destructive" className="text-[10px] py-0">
                      Unverified
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The generated answer could not be verified against authentic document chunks.
                    To preserve legal analysis integrity and prevent hallucination, this answer cannot be presented as verified evidence.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* 4c. Grounded Answer View */}
          {isGroundedSuccess && (
            <section
              aria-label="Grounded question answer"
              className="rounded-xl border bg-card p-5 sm:p-6 shadow-sm space-y-5"
              data-testid="ask-grounded-answer"
            >
              {/* Question & Grounded Status Header */}
              <div className="border-b pb-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="ready" className="gap-1.5 text-xs py-1 px-3">
                    <CheckCircle2 size={13} aria-hidden="true" />
                    <span>Grounded in Evidence</span>
                  </Badge>

                  <Badge variant="outline" className="text-xs font-medium">
                    {`${result.citations.length} ${result.citations.length === 1 ? "Citation" : "Citations"}`}
                  </Badge>
                </div>

                <div className="pt-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Question
                  </span>
                  <p className="text-base font-semibold text-foreground break-words pt-0.5">
                    {result.question}
                  </p>
                </div>
              </div>

              {/* Verified Answer Text */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Answer
                </span>
                <div className="text-sm sm:text-base leading-relaxed text-foreground whitespace-pre-line bg-muted/20 p-4 rounded-lg border border-muted/40">
                  {result.answer}
                </div>
              </div>

              {/* Citations Section */}
              <div
                className="pt-2 space-y-4"
                data-testid="ask-citations-section"
              >
                <div className="flex items-center justify-between gap-2 border-t pt-4">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5">
                      <Search size={15} className="text-primary" aria-hidden="true" />
                      <span>Supporting Document Evidence</span>
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Verbatim excerpts verified directly from the document.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {result.citations.map((citation, index) => {
                    const section = citation.sectionId && sectionsById
                      ? sectionsById.get(citation.sectionId)
                      : undefined;
                    const sectionTitle =
                      section?.title ||
                      (section
                        ? `Section ${section.orderIndex + 1}`
                        : "Document Section");

                    const pageLabel =
                      typeof citation.pageNumber === "number" && citation.pageNumber > 0
                        ? `Page ${citation.pageNumber}`
                        : "Page —";

                    return (
                      <div
                        key={citation.chunkId || `citation-${index}`}
                        className="rounded-lg border bg-muted/15 p-4 space-y-3 transition-colors hover:border-primary/40"
                        data-testid={`citation-card-${index}`}
                      >
                        {/* Citation Coordinates (NO similarity score per safety requirements) */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">
                              {pageLabel}
                            </Badge>
                            <span className="text-xs font-medium text-foreground truncate max-w-md">
                              {sectionTitle}
                            </span>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onNavigateToCitation?.(citation)}
                            className="text-xs gap-1.5 h-7 px-2.5 text-primary hover:text-primary hover:bg-primary/10"
                            data-testid={`citation-view-btn-${index}`}
                          >
                            <span>View in Document</span>
                            <ArrowRight size={13} aria-hidden="true" />
                          </Button>
                        </div>

                        {/* Verbatim Excerpt */}
                        <blockquote className="border-l-2 border-primary/50 pl-3 py-1 text-xs sm:text-sm text-foreground/90 font-mono bg-background/50 rounded-r break-words whitespace-pre-wrap">
                          {citation.sourceText}
                        </blockquote>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* 5. Empty / Initial State with Starter Prompts */}
      {!isLoading && !error && !result && (
        <section
          aria-label="Starter questions and instructions"
          className="rounded-xl border bg-card p-6 sm:p-8 space-y-5 shadow-sm text-center"
          data-testid="ask-empty-state"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HelpCircle size={24} aria-hidden="true" />
          </div>

          <div className="space-y-1.5 max-w-lg mx-auto">
            <h3 className="text-base font-semibold text-foreground">
              Ask Any Question About This Document
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ClauseWise searches authentic document sections to provide concise, plain-English answers with clickable citations back to the source text.
            </p>
          </div>

          <div className="space-y-2 pt-2 text-left max-w-xl mx-auto">
            <span className="text-xs font-medium text-muted-foreground block text-center sm:text-left">
              Suggested questions to get started:
            </span>
            <div className="grid grid-cols-1 gap-2">
              {STARTER_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectStarter(q)}
                  className="w-full text-left text-xs sm:text-sm px-3.5 py-2.5 rounded-lg border bg-muted/30 hover:bg-muted/70 hover:border-primary/40 transition-colors flex items-center justify-between gap-2 group text-foreground"
                >
                  <span className="truncate">{q}</span>
                  <ArrowRight
                    size={14}
                    className="text-muted-foreground group-hover:text-primary transition-colors shrink-0"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import {
  Quote,
  MapPin,
  ArrowRight,
  FileQuestion,
  AlertCircle,
  HelpCircle,
  BookOpen,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DocumentFinding, FindingImportance, FindingType } from "@/types";
import {
  FINDING_TYPE_DISPLAY_LABELS,
  IMPORTANCE_CONFIG,
} from "./FindingCard";

export interface EvidencePanelProps {
  finding: DocumentFinding | null;
  sectionTitle?: string;
  onJumpToSection?: (sectionId: string | null) => void;
  onViewInDocument?: (finding: DocumentFinding) => void;
  className?: string;
}

export function EvidencePanel({
  finding,
  sectionTitle,
  onJumpToSection,
  onViewInDocument,
  className,
}: EvidencePanelProps) {
  // Empty State: No finding selected
  if (!finding) {
    return (
      <Card
        className={cn(
          "h-full min-h-[380px] flex flex-col items-center justify-center p-8 text-center text-muted-foreground border-dashed bg-muted/10",
          className
        )}
        data-testid="evidence-panel-empty"
      >
        <BookOpen size={36} className="text-muted-foreground/50 mb-3" aria-hidden="true" />
        <h3 className="text-base font-semibold text-foreground mb-1">
          No Finding Selected
        </h3>
        <p className="text-sm max-w-sm">
          Select a finding from the list to inspect its meaning, supporting source excerpt, and location in the document text.
        </p>
      </Card>
    );
  }

  const isMissing = finding.findingType === "missing_information";
  const typeLabel =
    FINDING_TYPE_DISPLAY_LABELS[finding.findingType as FindingType] || finding.findingType;
  const importanceInfo =
    IMPORTANCE_CONFIG[finding.importance as FindingImportance] ||
    IMPORTANCE_CONFIG.informational;
  const ImportanceIcon = importanceInfo.icon;

  const metadata = (finding.metadata || {}) as Record<string, unknown>;
  const expectedTopic = typeof metadata.expectedTopic === "string" ? metadata.expectedTopic : null;
  const ruleBasis = typeof metadata.ruleBasis === "string" ? metadata.ruleBasis : null;

  return (
    <Card
      className={cn("h-full flex flex-col border shadow-sm", className)}
      data-testid="evidence-panel-active"
    >
      <CardHeader className="border-b pb-4 space-y-3">
        {/* Badges Bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn("gap-1 py-1 px-2.5 text-xs font-semibold", importanceInfo.badgeClass)}
            >
              <ImportanceIcon size={14} aria-hidden="true" />
              <span>{importanceInfo.label}</span>
            </Badge>

            <Badge variant="outline" className="text-xs px-2.5 py-1 text-muted-foreground">
              {typeLabel}
            </Badge>
          </div>

          {/* Location Reference */}
          {!isMissing && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <MapPin size={14} aria-hidden="true" className="text-primary" />
              <span>{sectionTitle || "Referenced Section"}</span>
              {typeof finding.pageNumber === "number" && finding.pageNumber > 0 && (
                <span>{`• Page ${finding.pageNumber}`}</span>
              )}
            </div>
          )}
        </div>

        {/* Finding Label */}
        <CardTitle className="text-lg sm:text-xl font-bold text-foreground leading-snug break-words">
          {finding.label}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 space-y-6 flex-1 flex flex-col justify-between">
        <div className="space-y-6">
          {/* Meaning / Plain English Summary */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Meaning
            </span>
            <p className="text-sm leading-relaxed text-foreground">
              {finding.summary}
            </p>
          </div>

          {/* Substantive Evidence Block */}
          {!isMissing && (
            <div className="space-y-2.5" data-testid="substantive-evidence-block">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Quote size={14} className="text-primary" aria-hidden="true" />
                  Supporting Evidence (Source Text)
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Verified Provenance
                </span>
              </div>

              {finding.sourceText ? (
                <blockquote className="rounded-lg border-l-4 border-primary bg-muted/40 p-4 font-serif italic text-sm sm:text-base leading-relaxed text-foreground whitespace-pre-wrap break-words shadow-inner">
                  &ldquo;{finding.sourceText}&rdquo;
                </blockquote>
              ) : (
                <p className="text-xs text-muted-foreground italic border rounded p-3 bg-muted/20">
                  No source text excerpt was stored for this finding.
                </p>
              )}
            </div>
          )}

          {/* Missing Information Block (Zero Fake Excerpts) */}
          {isMissing && (
            <div
              className="rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3"
              data-testid="missing-information-evidence-block"
            >
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm">
                <AlertCircle size={18} aria-hidden="true" className="shrink-0" />
                <span>Absence in Document</span>
              </div>

              <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                This item flags a standard provision typically expected for this document type that was not identified in the document text. No source text exists because the provision is absent.
              </p>

              {expectedTopic && (
                <div className="text-xs space-y-0.5 pt-1">
                  <span className="font-semibold text-amber-900 dark:text-amber-200 block">
                    Expected Topic:
                  </span>
                  <span className="text-muted-foreground font-mono bg-amber-100/80 dark:bg-amber-900/40 px-1.5 py-0.5 rounded text-[11px]">
                    {expectedTopic}
                  </span>
                </div>
              )}

              {ruleBasis && (
                <div className="text-xs space-y-0.5">
                  <span className="font-semibold text-amber-900 dark:text-amber-200 block">
                    Why Flagged:
                  </span>
                  <span className="text-muted-foreground leading-relaxed">
                    {ruleBasis}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Contextual Action Button (View in Document Text) */}
        {!isMissing && finding.sourceText && finding.sectionId && (onViewInDocument || onJumpToSection) && (
          <div className="border-t pt-4 mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Examine full section in context
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (onViewInDocument) {
                  onViewInDocument(finding);
                } else if (onJumpToSection) {
                  onJumpToSection(finding.sectionId);
                }
              }}
              className="gap-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
              aria-label={`Jump to ${sectionTitle || "section"} in document text`}
              data-testid="jump-to-section-button"
            >
              <span>View in Document Text</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

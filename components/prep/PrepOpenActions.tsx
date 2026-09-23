"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckSquare,
  Square,
  ArrowRight,
  ExternalLink,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionWithDetails, ActionStatus } from "@/types";

export interface PrepOpenActionsProps {
  actions: ActionWithDetails[];
  completedCount: number;
  onToggleStatus?: (actionId: string, currentStatus: ActionStatus) => Promise<void>;
  onViewActionEvidence?: (action: ActionWithDetails) => void;
  className?: string;
}

export function PrepOpenActions({
  actions,
  completedCount,
  onToggleStatus,
  onViewActionEvidence,
  className,
}: PrepOpenActionsProps) {
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const handleToggle = async (action: ActionWithDetails) => {
    if (!onToggleStatus || updatingId) return;
    setUpdatingId(action.id);
    try {
      await onToggleStatus(action.id, action.status as ActionStatus);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Card
      className={cn("border-border shadow-xs", className)}
      data-testid="prep-open-actions"
    >
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
            <CheckSquare size={18} className="text-primary" aria-hidden="true" />
            <span>Open Review Checklist Items</span>
          </CardTitle>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {actions.length} open
            </Badge>
            {completedCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {completedCount} completed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {actions.length > 0 ? (
          <div className="space-y-3" role="list">
            {actions.map((action) => {
              const isUpdating = updatingId === action.id;
              const finding = action.finding;

              return (
                <div
                  key={action.id}
                  className="rounded-lg border border-border/70 p-3.5 bg-card hover:border-border transition-colors flex items-start justify-between gap-3"
                  data-testid={`prep-action-item-${action.id}`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Status Checkbox */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={action.status === "completed"}
                      onClick={() => handleToggle(action)}
                      disabled={isUpdating || !onToggleStatus}
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer print:hidden",
                        action.status === "completed"
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-muted-foreground/60 hover:border-primary"
                      )}
                      aria-label={`Mark action "${action.title}" as completed`}
                    >
                      {isUpdating ? (
                        <Loader2 size={10} className="animate-spin text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <Square size={10} className="text-transparent" aria-hidden="true" />
                      )}
                    </button>

                    <div className="space-y-1 min-w-0 flex-1">
                      <h4 className="text-xs sm:text-sm font-semibold text-foreground leading-snug break-words">
                        {action.title}
                      </h4>

                      {action.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {action.description}
                        </p>
                      )}

                      {/* Finding Provenance Quote */}
                      {finding?.sourceText && (
                        <blockquote className="rounded bg-muted/40 border-l-2 border-primary/40 px-2.5 py-1 mt-1 text-[11px] text-foreground/80 italic line-clamp-2">
                          &ldquo;{finding.sourceText.trim()}&rdquo;
                          {finding.sectionTitle && (
                            <span className="block not-italic text-[10px] text-muted-foreground mt-0.5 font-medium">
                              — {finding.sectionTitle}
                              {finding.pageNumber ? ` (Page ${finding.pageNumber})` : ""}
                            </span>
                          )}
                        </blockquote>
                      )}
                    </div>
                  </div>

                  {/* View Evidence Link */}
                  {finding?.sourceText && onViewActionEvidence && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewActionEvidence(action)}
                      className="gap-1 text-[11px] h-7 px-2 shrink-0 text-primary hover:text-primary hover:bg-primary/10 print:hidden"
                      aria-label={`View evidence for action "${action.title}" in document text`}
                    >
                      <span>View Evidence</span>
                      <ArrowRight size={12} aria-hidden="true" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className="rounded-lg border border-dashed p-6 text-center text-muted-foreground space-y-1.5"
            data-testid="prep-open-actions-empty"
          >
            <CheckCircle size={24} className="mx-auto text-emerald-600 mb-1" aria-hidden="true" />
            <p className="text-xs sm:text-sm font-semibold text-foreground">
              No Open Review Items
            </p>
            <p className="text-xs max-w-sm mx-auto">
              All review actions for this document are complete, or none have been created yet. You can add actions directly from findings in the Intelligence & Findings tab.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

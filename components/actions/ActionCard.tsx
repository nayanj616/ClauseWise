"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckSquare,
  Square,
  FileText,
  MapPin,
  Quote,
  ExternalLink,
  Trash2,
  Calendar,
  AlertCircle,
  FileQuestion,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionWithDetails, ActionStatus } from "@/types";
import {
  FINDING_TYPE_DISPLAY_LABELS,
  IMPORTANCE_CONFIG,
} from "@/components/workspace/FindingCard";
import { cn } from "@/lib/utils";

export interface ActionCardProps {
  action: ActionWithDetails;
  onToggleStatus: (actionId: string, currentStatus: ActionStatus) => Promise<void>;
  onDelete: (actionId: string) => Promise<void>;
  className?: string;
}

export function ActionCard({
  action,
  onToggleStatus,
  onDelete,
  className,
}: ActionCardProps) {
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const isCompleted = action.status === "completed";
  const finding = action.finding;
  const isMissing = finding?.findingType === "missing_information";

  const handleToggle = async () => {
    if (isUpdating || isDeleting) return;
    setIsUpdating(true);
    try {
      await onToggleStatus(action.id, action.status as ActionStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting || isUpdating) return;
    if (window.confirm(`Delete action "${action.title}"?`)) {
      setIsDeleting(true);
      try {
        await onDelete(action.id);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  // Build direct jump URL to document section with finding highlight
  const documentHref = React.useMemo(() => {
    const params = new URLSearchParams();
    if (finding?.sectionId) params.set("sectionId", finding.sectionId);
    if (finding?.id) params.set("findingId", finding.id);
    params.set("tab", "document");
    const query = params.toString();
    const basePath =
      action.documentId === "test-doc-12345"
        ? "/test-workspace"
        : `/documents/${action.documentId}`;
    return `${basePath}${query ? `?${query}` : ""}`;
  }, [action.documentId, finding]);

  return (
    <div
      className={cn(
        "rounded-xl border p-4 sm:p-5 transition-all bg-card flex flex-col gap-3.5 shadow-2xs group",
        isCompleted
          ? "border-border/60 bg-muted/20 opacity-80"
          : "border-border/90 hover:border-border hover:shadow-xs",
        className
      )}
      data-testid={`action-card-${action.id}`}
    >
      {/* Top Bar: Checkbox, Title, and Actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* Status Checkbox Button */}
          <button
            type="button"
            role="checkbox"
            aria-checked={isCompleted}
            onClick={handleToggle}
            disabled={isUpdating}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
              isCompleted
                ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500"
                : "border-muted-foreground/50 hover:border-primary hover:bg-primary/5"
            )}
            aria-label={
              isCompleted
                ? `Reopen action: ${action.title}`
                : `Complete action: ${action.title}`
            }
            data-testid={`action-checkbox-${action.id}`}
          >
            {isUpdating ? (
              <Loader2 size={12} className="animate-spin text-muted-foreground" aria-hidden="true" />
            ) : isCompleted ? (
              <CheckSquare size={13} aria-hidden="true" />
            ) : (
              <Square size={13} className="text-transparent" aria-hidden="true" />
            )}
          </button>

          {/* Action Title and Description */}
          <div className="space-y-1 min-w-0 flex-1">
            <h3
              className={cn(
                "text-sm font-semibold text-foreground leading-snug break-words",
                isCompleted && "line-through text-muted-foreground"
              )}
            >
              {action.title}
            </h3>

            {action.description && (
              <p
                className={cn(
                  "text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words",
                  isCompleted && "line-through opacity-70"
                )}
              >
                {action.description}
              </p>
            )}
          </div>
        </div>

        {/* Delete Action Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={isDeleting || isUpdating}
          className="h-7 w-7 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 shrink-0"
          aria-label={`Delete action: ${action.title}`}
          data-testid={`action-delete-${action.id}`}
        >
          {isDeleting ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 size={14} aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Provenance Box: Document, Finding, Section & Source Text */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5 text-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap text-muted-foreground">
          {/* Document Reference */}
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText size={13} className="text-primary shrink-0" aria-hidden="true" />
            <span
              className="font-medium text-foreground truncate max-w-[200px] sm:max-w-xs"
              title={action.document.title}
            >
              {action.document.title}
            </span>
          </div>

          {/* Location Reference */}
          {finding && !isMissing && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <MapPin size={11} aria-hidden="true" className="text-primary shrink-0" />
              <span>{finding.sectionTitle || "Section"}</span>
              {typeof finding.pageNumber === "number" && finding.pageNumber > 0 && (
                <span>{`• p. ${finding.pageNumber}`}</span>
              )}
            </div>
          )}

          {finding && isMissing && (
            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium text-[11px]">
              <FileQuestion size={11} aria-hidden="true" />
              <span>Absence in document</span>
            </span>
          )}
        </div>

        {/* Finding Summary Context */}
        {finding && (
          <div className="space-y-1 pt-1 border-t border-border/40">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-xs">
                Finding: {finding.label}
              </span>
            </div>
            <p className="text-muted-foreground text-[11px] line-clamp-2">
              {finding.summary}
            </p>
          </div>
        )}

        {/* Substantive Source Text Excerpt Quote */}
        {finding?.sourceText && !isMissing && (
          <blockquote className="rounded border-l-2 border-primary bg-background/60 p-2 font-serif italic text-foreground text-[11px] leading-relaxed line-clamp-2">
            &ldquo;{finding.sourceText}&rdquo;
          </blockquote>
        )}
      </div>

      {/* Footer Bar: Timestamp and View Source Link */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
        <div className="flex items-center gap-2">
          {isCompleted && action.completedAt ? (
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              Completed {new Date(action.completedAt).toLocaleDateString()}
            </span>
          ) : (
            <span>Created {new Date(action.createdAt).toLocaleDateString()}</span>
          )}
        </div>

        {/* View in Document / Source Jump Link */}
        <Link
          href={documentHref}
          className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
          data-testid={`action-view-source-${action.id}`}
        >
          <span>View source in document</span>
          <ExternalLink size={11} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

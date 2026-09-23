"use client";

import * as React from "react";
import {
  X,
  PlusCircle,
  FileQuestion,
  MapPin,
  Quote,
  Loader2,
  AlertCircle,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { Action, DocumentFinding, FindingImportance, FindingType } from "@/types";
import {
  FINDING_TYPE_DISPLAY_LABELS,
  IMPORTANCE_CONFIG,
} from "@/components/workspace/FindingCard";
import { cn } from "@/lib/utils";

export interface CreateActionDialogProps {
  finding: DocumentFinding | null;
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  onActionCreated?: (action: Action) => void;
  sectionTitle?: string;
}

export function CreateActionDialog({
  finding,
  documentId,
  isOpen,
  onClose,
  onActionCreated,
  sectionTitle,
}: CreateActionDialogProps) {
  const [title, setTitle] = React.useState(
    finding ? `Review ${finding.label}` : ""
  );
  const [description, setDescription] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Set default title when finding changes
  React.useEffect(() => {
    if (finding) {
      setTitle(`Review ${finding.label}`);
      setDescription("");
      setErrorMessage(null);
    } else {
      setTitle("");
      setDescription("");
      setErrorMessage(null);
    }
  }, [finding]);

  // Focus title input on open
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // Escape key listener to close
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !finding) return null;

  const isMissing = finding.findingType === "missing_information";
  const typeLabel =
    FINDING_TYPE_DISPLAY_LABELS[finding.findingType as FindingType] || finding.findingType;
  const importanceInfo =
    IMPORTANCE_CONFIG[finding.importance as FindingImportance] ||
    IMPORTANCE_CONFIG.informational;
  const ImportanceIcon = importanceInfo.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage("Please enter an action title.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          findingId: finding.id,
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create action");
      }

      onActionCreated?.(data.action);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-action-dialog-title"
        className="relative w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl space-y-5 animate-in zoom-in-95"
        data-testid="create-action-dialog"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckSquare size={18} aria-hidden="true" />
            </div>
            <div>
              <h2
                id="create-action-dialog-title"
                className="text-base font-semibold text-foreground"
              >
                Add to Action Center
              </h2>
              <p className="text-xs text-muted-foreground">
                Convert this finding into a trackable legal review item.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Close dialog"
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </div>

        {/* Linked Finding Preview Context */}
        <div className="rounded-lg border bg-muted/30 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge
                variant="outline"
                className={cn("gap-1 py-0.5 px-2 text-[10px] font-semibold", importanceInfo.badgeClass)}
              >
                <ImportanceIcon size={11} aria-hidden="true" />
                <span>{importanceInfo.label}</span>
              </Badge>
              <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground">
                {typeLabel}
              </Badge>
            </div>

            {!isMissing && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                <MapPin size={11} aria-hidden="true" className="text-primary" />
                <span>{sectionTitle || "Section"}</span>
                {typeof finding.pageNumber === "number" && finding.pageNumber > 0 && (
                  <span>{`• p. ${finding.pageNumber}`}</span>
                )}
              </div>
            )}
            {isMissing && (
              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium text-[11px]">
                <FileQuestion size={11} aria-hidden="true" />
                <span>Absence in document</span>
              </span>
            )}
          </div>

          <h3 className="font-semibold text-foreground text-xs">{finding.label}</h3>
          <p className="text-muted-foreground line-clamp-2">{finding.summary}</p>

          {!isMissing && finding.sourceText && (
            <div className="pt-1.5 border-t border-border/40 font-serif italic text-muted-foreground/90 line-clamp-2">
              &ldquo;{finding.sourceText}&rdquo;
            </div>
          )}
        </div>

        {/* Error message */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="action-title" className="text-xs font-semibold">
              Action Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="action-title"
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Confirm whether notice period can be shortened"
              maxLength={300}
              required
              disabled={isSubmitting}
              className="text-xs"
              data-testid="create-action-title-input"
            />
            <p className="text-[11px] text-muted-foreground text-right">
              {title.length}/300
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="action-description" className="text-xs font-semibold">
              Description / Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <textarea
              id="action-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add review notes, questions to ask legal counsel, or internal policy references..."
              maxLength={2000}
              rows={3}
              disabled={isSubmitting}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              data-testid="create-action-description-input"
            />
            <p className="text-[11px] text-muted-foreground text-right">
              {description.length}/2000
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !title.trim()}
              className="text-xs gap-1.5"
              data-testid="create-action-submit-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <PlusCircle size={13} aria-hidden="true" />
                  <span>Add Action</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

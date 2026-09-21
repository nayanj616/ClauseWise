import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  FileQuestion,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from "@/types";

interface StateProps {
  filename?: string;
  className?: string;
}

/**
 * Renders the state when a document is still undergoing extraction or processing.
 * Never displays fabricated content.
 */
export function DocumentProcessingState({
  status,
  filename,
}: StateProps & { status: DocumentStatus }) {
  const statusLabel = DOCUMENT_STATUS_LABELS[status] || "Processing…";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center min-h-[420px] rounded-xl border border-muted bg-card p-8 text-center space-y-5 animate-fade-in"
      data-testid="workspace-processing-state"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Loader2 size={28} className="animate-spin" aria-hidden="true" />
      </div>

      <div className="space-y-2 max-w-md">
        <Badge variant="outline" className="mb-1 text-xs">
          {statusLabel}
        </Badge>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Document is being processed
        </h2>
        {filename && (
          <p className="text-sm font-medium text-muted-foreground truncate" title={filename}>
            {filename}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Extracted content is not yet available while text extraction and section detection are in progress.
        </p>
      </div>

      <Button asChild variant="outline" size="sm" className="gap-2">
        <Link href="/documents">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Documents
        </Link>
      </Button>
    </div>
  );
}

/**
 * Renders the error state when extraction fails.
 * Safe generic messaging; never leaks SQL, credentials, paths, or stack traces.
 */
export function DocumentErrorState({
  filename,
  errorMessage,
}: StateProps & { errorMessage?: string | null }) {
  // Use safe provided message or fallback to user-safe generic explanation
  const safeMessage =
    errorMessage && !errorMessage.includes("password") && !errorMessage.includes("postgres") && !errorMessage.includes("at ")
      ? errorMessage
      : "Failed to extract readable text from this document.";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center justify-center min-h-[420px] rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center space-y-5 animate-fade-in"
      data-testid="workspace-error-state"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle size={28} aria-hidden="true" />
      </div>

      <div className="space-y-2 max-w-md">
        <Badge variant="destructive" className="mb-1 text-xs">
          Extraction Error
        </Badge>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Extraction could not be completed
        </h2>
        {filename && (
          <p className="text-sm font-medium text-muted-foreground truncate" title={filename}>
            {filename}
          </p>
        )}
        <p className="text-sm text-destructive font-medium">
          {safeMessage}
        </p>
        <p className="text-xs text-muted-foreground">
          Please verify that the document is not encrypted, corrupted, or scanned without searchable text.
        </p>
      </div>

      <Button asChild variant="outline" size="sm" className="gap-2">
        <Link href="/documents">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Documents
        </Link>
      </Button>
    </div>
  );
}

/**
 * Defensive state when status is ready but 0 sections were extracted.
 */
export function EmptyContentState({ filename }: StateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center min-h-[420px] rounded-xl border border-muted bg-card p-8 text-center space-y-5 animate-fade-in"
      data-testid="workspace-empty-state"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileText size={28} aria-hidden="true" />
      </div>

      <div className="space-y-2 max-w-md">
        <Badge variant="outline" className="mb-1 text-xs">
          Empty Content
        </Badge>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          No readable content found
        </h2>
        {filename && (
          <p className="text-sm font-medium text-muted-foreground truncate" title={filename}>
            {filename}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          The document was processed, but no readable sections or clauses could be extracted from the file.
        </p>
      </div>

      <Button asChild variant="outline" size="sm" className="gap-2">
        <Link href="/documents">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Documents
        </Link>
      </Button>
    </div>
  );
}

/**
 * Not-found state when the document ID does not resolve or ownership is denied.
 */
export function DocumentNotFoundState() {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[420px] rounded-xl border border-muted bg-card p-8 text-center space-y-5 animate-fade-in"
      data-testid="workspace-not-found-state"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion size={28} aria-hidden="true" />
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Document Not Found
        </h2>
        <p className="text-sm text-muted-foreground">
          The requested document could not be found, or you do not have permission to view it.
        </p>
      </div>

      <Button asChild variant="default" size="sm" className="gap-2">
        <Link href="/documents">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Documents
        </Link>
      </Button>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Layers,
  Sparkles,
  FileText,
  Info,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_STATUS_LABELS,
  type WorkspaceDocument,
  type DocumentStatus,
} from "@/types";

export interface DocumentHeaderProps {
  document: WorkspaceDocument;
  sectionCount: number;
  activeTab: "analysis" | "document" | "ask";
  onTabChange: (tab: "analysis" | "document" | "ask") => void;
  findingsCount?: number;
  className?: string;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  nda: "Non-Disclosure Agreement",
  employment_agreement: "Employment Agreement",
  lease_agreement: "Lease Agreement",
  service_agreement: "Service Agreement",
  commercial_contract: "Commercial Contract",
  general: "General Contract",
};

/**
 * Formats file size in human-readable units.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Derives a human-readable format label from MIME type.
 */
function formatMimeType(mimeType: string, filename: string): string {
  if (mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    return "PDF";
  }
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx")
  ) {
    return "DOCX";
  }
  if (mimeType === "text/plain" || filename.toLowerCase().endsWith(".txt")) {
    return "TXT";
  }
  return "Document";
}

/**
 * Resolves human-readable document type label.
 */
export function getDocumentTypeLabel(typeKey?: string | null): string {
  if (!typeKey || !typeKey.trim()) {
    return "Unclassified Document";
  }
  const clean = typeKey.trim().toLowerCase();
  return DOCUMENT_TYPE_LABELS[clean] || clean.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Returns appropriate badge variant for existing document status model.
 */
function getStatusBadgeVariant(status: DocumentStatus): "ready" | "destructive" | "outline" | "secondary" {
  if (status === "ready") return "ready";
  if (status === "error") return "destructive";
  return "outline";
}

export function DocumentHeader({
  document,
  sectionCount,
  activeTab,
  onTabChange,
  findingsCount = 0,
  className,
}: DocumentHeaderProps) {
  const docFormat = formatMimeType(document.mimeType, document.filename);
  const statusLabel = DOCUMENT_STATUS_LABELS[document.status] || document.status;
  const docTypeLabel = getDocumentTypeLabel(document.documentType);

  // Check if classification is stated vs inferred from persisted metadata
  const classificationMeta = document.metadata?.classification as
    | { isStatedInText?: boolean; inferenceReason?: string | null }
    | undefined;
  const isStatedInText = classificationMeta?.isStatedInText === true;
  const isClassified = Boolean(document.documentType);

  return (
    <header
      className={cn(
        "rounded-xl border bg-card p-5 sm:p-6 shadow-sm space-y-4",
        className
      )}
      data-testid="document-intelligence-header"
    >
      {/* Top navigation & document status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="gap-2 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <Link href="/documents">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Documents</span>
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Badge
            variant={getStatusBadgeVariant(document.status)}
            className="gap-1.5 py-1 px-3"
            data-testid="header-status-badge"
          >
            {document.status === "ready" && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse"
                aria-hidden="true"
              />
            )}
            <span>{statusLabel}</span>
          </Badge>
        </div>
      </div>

      {/* Document Title & Metadata */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            className="text-xl sm:text-2xl font-bold tracking-tight text-foreground break-words"
            title={document.filename}
          >
            {document.filename}
          </h1>

          {/* Classification Badge */}
          {isClassified ? (
            <Badge
              variant="informational"
              className="gap-1.5 py-1 px-2.5 font-medium text-xs shrink-0"
              title={
                isStatedInText
                  ? "Explicitly stated in document text"
                  : classificationMeta?.inferenceReason || "Inferred from document structure"
              }
              data-testid="header-classification-badge"
            >
              <Sparkles size={12} aria-hidden="true" />
              <span>{docTypeLabel}</span>
              <span className="text-[10px] opacity-75 font-normal">
                {isStatedInText ? "• Stated" : "• Inferred"}
              </span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="py-1 px-2.5 text-xs text-muted-foreground"
              data-testid="header-classification-badge"
            >
              Unclassified
            </Badge>
          )}
        </div>

        {/* Informational Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-medium text-xs">
            {docFormat}
          </Badge>

          {document.fileSizeBytes > 0 && (
            <span className="flex items-center gap-1">
              <span>•</span>
              <span>{formatFileSize(document.fileSizeBytes)}</span>
            </span>
          )}

          {typeof document.pageCount === "number" && document.pageCount > 0 && (
            <span className="flex items-center gap-1">
              <span>•</span>
              <span className="font-medium">
                {`${document.pageCount} ${document.pageCount === 1 ? "page" : "pages"}`}
              </span>
            </span>
          )}

          {sectionCount > 0 && (
            <span className="flex items-center gap-1">
              <span>•</span>
              <span>{`${sectionCount} ${sectionCount === 1 ? "section" : "sections"}`}</span>
            </span>
          )}

          {document.createdAt && (
            <span className="flex items-center gap-1 hidden sm:inline-flex">
              <span>•</span>
              <Calendar size={12} aria-hidden="true" />
              <span>{new Date(document.createdAt).toLocaleDateString()}</span>
            </span>
          )}
        </div>
      </div>

      {/* Workspace Tabs Navigation */}
      <div
        role="tablist"
        aria-label="Workspace views"
        className="flex items-center gap-2 border-t pt-4"
      >
        <button
          type="button"
          role="tab"
          id="tab-analysis"
          aria-selected={activeTab === "analysis"}
          aria-controls="panel-analysis"
          onClick={() => onTabChange("analysis")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeTab === "analysis"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          )}
        >
          <Sparkles size={15} aria-hidden="true" />
          <span>Intelligence & Findings</span>
          {findingsCount > 0 && (
            <span
              className={cn(
                "ml-1 text-xs px-1.5 py-0.2 rounded-full font-semibold",
                activeTab === "analysis"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {findingsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-document"
          aria-selected={activeTab === "document"}
          aria-controls="panel-document"
          onClick={() => onTabChange("document")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeTab === "document"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          )}
        >
          <FileText size={15} aria-hidden="true" />
          <span>Document Text</span>
          {sectionCount > 0 && (
            <span
              className={cn(
                "ml-1 text-xs px-1.5 py-0.2 rounded-full font-semibold",
                activeTab === "document"
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {sectionCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-ask"
          aria-selected={activeTab === "ask"}
          aria-controls="panel-ask"
          onClick={() => onTabChange("ask")}
          className={cn(
            "flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeTab === "ask"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          )}
        >
          <MessageSquare size={15} aria-hidden="true" />
          <span>Ask</span>
        </button>
      </div>
    </header>
  );
}


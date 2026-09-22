"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Calendar,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, getHighlightSegments, type HighlightSegments } from "@/lib/utils";
import type { WorkspaceDocument, WorkspaceSection } from "@/types";

export interface DocumentViewerProps {
  document: WorkspaceDocument;
  sections: WorkspaceSection[];
  className?: string;
  selectedIndex?: number;
  onSelectIndex?: (index: number) => void;
  hideHeader?: boolean;
  highlightExcerpt?: string | null;
  highlightRef?: React.Ref<HTMLElement>;
}

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
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
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
 * Formats genuine page coordinates for display.
 * Returns null if page coordinates are unavailable (never fabricates 0 or 1).
 */
export function formatPageRange(
  pageStart?: number | null,
  pageEnd?: number | null
): string | null {
  if (typeof pageStart !== "number" || isNaN(pageStart) || pageStart <= 0) {
    return null;
  }

  if (typeof pageEnd === "number" && !isNaN(pageEnd) && pageEnd > pageStart) {
    return `Pages ${pageStart}–${pageEnd}`;
  }

  return `Page ${pageStart}`;
}

/**
 * Compact page badge string for sidebar items (e.g. "p. 1" or "pp. 2–3").
 */
function formatPageBadge(
  pageStart?: number | null,
  pageEnd?: number | null
): string | null {
  if (typeof pageStart !== "number" || isNaN(pageStart) || pageStart <= 0) {
    return null;
  }

  if (typeof pageEnd === "number" && !isNaN(pageEnd) && pageEnd > pageStart) {
    return `pp. ${pageStart}–${pageEnd}`;
  }

  return `p. ${pageStart}`;
}

/**
 * Resolves section display title with fallback when title is absent or generic.
 */
function getSectionDisplayTitle(section: WorkspaceSection): string {
  if (section.title && section.title.trim()) {
    return section.title.trim();
  }
  const fallbackNum = section.sectionNumber ?? section.orderIndex + 1;
  return `Section ${fallbackNum}`;
}

interface SectionContentRendererProps {
  segments: HighlightSegments;
  content: string;
  highlightRef?: React.Ref<HTMLElement>;
}

function SectionContentRenderer({
  segments,
  content,
  highlightRef,
}: SectionContentRendererProps) {
  if (!segments.hasMatch) {
    return <>{content}</>;
  }

  return (
    <>
      {segments.before}
      <mark
        ref={highlightRef}
        id="active-evidence-highlight"
        data-testid="evidence-highlight"
        tabIndex={-1}
        className="bg-amber-200/80 text-foreground dark:bg-amber-900/60 dark:text-amber-100 rounded px-0.5 font-medium border-b-2 border-amber-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {segments.highlighted}
      </mark>
      {segments.after}
    </>
  );
}

export function DocumentViewer({
  document,
  sections,
  className,
  selectedIndex: controlledIndex,
  onSelectIndex,
  hideHeader = false,
  highlightExcerpt,
  highlightRef,
}: DocumentViewerProps) {
  // Local state for active section selection (controlled or uncontrolled fallback)
  const [internalIndex, setInternalIndex] = React.useState<number>(0);
  const selectedIndex = typeof controlledIndex === "number" ? controlledIndex : internalIndex;

  const setSelectedIndex = (updater: number | ((prev: number) => number)) => {
    const nextVal = typeof updater === "function" ? updater(selectedIndex) : updater;
    if (onSelectIndex) {
      onSelectIndex(nextVal);
    } else {
      setInternalIndex(nextVal);
    }
  };

  // Guard against out-of-bounds index
  const safeIndex = Math.max(0, Math.min(selectedIndex, sections.length - 1));
  const activeSection = sections[safeIndex] || sections[0];

  // Resolve highlight segments for active section content
  const highlightSegments = React.useMemo(() => {
    return getHighlightSegments(activeSection?.content, highlightExcerpt);
  }, [activeSection?.content, highlightExcerpt]);

  const hasMultipleSections = sections.length > 1;
  const docFormat = formatMimeType(document.mimeType, document.filename);
  const activePageInfo = formatPageRange(
    activeSection?.pageStart,
    activeSection?.pageEnd
  );

  return (
    <div
      className={cn("flex flex-col gap-6 animate-fade-in", className)}
      data-testid="document-workspace-viewer"
    >
      {/* ----------------------------------------------------------------- */}
      {/* Header Area (optional if workspace provides master header)        */}
      {/* ----------------------------------------------------------------- */}
      {!hideHeader && (
        <header className="rounded-xl border bg-card p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
              <Link href="/documents">
                <ArrowLeft size={16} aria-hidden="true" />
                Documents
              </Link>
            </Button>

            <Badge variant="ready" className="gap-1.5 py-1 px-3">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" aria-hidden="true" />
              Ready
            </Badge>
          </div>

          <div className="space-y-1">
            <h1
              className="text-xl sm:text-2xl font-bold tracking-tight text-foreground break-words"
              title={document.filename}
            >
              {document.filename}
            </h1>

            {/* Metadata Badges */}
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
                  <span className="font-medium">{`${document.pageCount} ${document.pageCount === 1 ? "page" : "pages"}`}</span>
                </span>
              )}

              {sections.length > 0 && (
                <span className="flex items-center gap-1">
                  <span>•</span>
                  <span>{`${sections.length} ${sections.length === 1 ? "section" : "sections"}`}</span>
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
        </header>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Content Area: Single Section View                                 */}
      {/* ----------------------------------------------------------------- */}
      {!hasMultipleSections && activeSection && (
        <main
          className="rounded-xl border bg-card p-6 sm:p-8 shadow-sm space-y-4"
          aria-label="Document Content"
          data-testid="single-section-view"
        >
          <div className="border-b pb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              {getSectionDisplayTitle(activeSection)}
            </h2>

            {activePageInfo && (
              <Badge variant="outline" className="text-xs text-muted-foreground font-mono">
                {activePageInfo}
              </Badge>
            )}
          </div>

          <div className="whitespace-pre-wrap font-sans text-sm sm:text-base leading-relaxed text-foreground break-words pt-2">
            <SectionContentRenderer
              segments={highlightSegments}
              content={activeSection.content}
              highlightRef={highlightRef}
            />
          </div>
        </main>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Content Area: Multiple Sections View (Sidebar + Main Content)    */}
      {/* ----------------------------------------------------------------- */}
      {hasMultipleSections && (
        <div
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          data-testid="multi-section-view"
        >
          {/* Left / Secondary Section Navigation Sidebar */}
          <nav
            aria-label="Document Sections Navigation"
            className="lg:col-span-4 rounded-xl border bg-card p-3 shadow-sm space-y-1 lg:sticky lg:top-6 max-h-[80vh] overflow-y-auto"
            data-testid="section-navigation-sidebar"
          >
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 border-b mb-2">
              <Layers size={14} aria-hidden="true" />
              <span>{`Sections (${sections.length})`}</span>
            </div>

            <ol className="space-y-1">
              {sections.map((sec, index) => {
                const isSelected = index === safeIndex;
                const pageBadge = formatPageBadge(sec.pageStart, sec.pageEnd);
                const title = getSectionDisplayTitle(sec);

                return (
                  <li key={sec.id || index}>
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        "w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 group",
                        isSelected
                          ? "bg-primary/10 text-primary font-medium border border-primary/20"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <span className="truncate flex-1" title={title}>
                        {title}
                      </span>

                      {pageBadge && (
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0",
                            isSelected
                              ? "bg-primary/20 text-primary font-medium"
                              : "bg-muted text-muted-foreground group-hover:bg-muted-foreground/10"
                          )}
                        >
                          {pageBadge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Main Selected Section Content Display */}
          <main
            aria-label={`Content for ${getSectionDisplayTitle(activeSection)}`}
            className="lg:col-span-8 rounded-xl border bg-card p-6 sm:p-8 shadow-sm space-y-6"
            data-testid="active-section-content"
          >
            {/* Section Header */}
            <div className="border-b pb-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline" className="text-xs">
                  {`Section ${activeSection.orderIndex + 1} of ${sections.length}`}
                </Badge>

                {activePageInfo && (
                  <Badge variant="outline" className="text-xs text-muted-foreground font-mono">
                    {activePageInfo}
                  </Badge>
                )}
              </div>

              <h2 className="text-xl font-semibold tracking-tight text-foreground break-words">
                {getSectionDisplayTitle(activeSection)}
              </h2>
            </div>

            {/* Verbatim Extracted Text */}
            <div className="whitespace-pre-wrap font-sans text-sm sm:text-base leading-relaxed text-foreground break-words min-h-[200px]">
              <SectionContentRenderer
                segments={highlightSegments}
                content={activeSection.content}
                highlightRef={highlightRef}
              />
            </div>

            {/* Previous / Next Section Pagination Controls */}
            <footer className="flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
                disabled={safeIndex === 0}
                className="gap-1.5"
                aria-label="Previous section"
              >
                <ChevronLeft size={16} aria-hidden="true" />
                Previous
              </Button>

              <span className="text-xs font-medium">
                {`${safeIndex + 1} / ${sections.length}`}
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedIndex((prev) => Math.min(sections.length - 1, prev + 1))}
                disabled={safeIndex === sections.length - 1}
                className="gap-1.5"
                aria-label="Next section"
              >
                Next
                <ChevronRight size={16} aria-hidden="true" />
              </Button>
            </footer>
          </main>
        </div>
      )}
    </div>
  );
}

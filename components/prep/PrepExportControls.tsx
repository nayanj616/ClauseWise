"use client";

import * as React from "react";
import { Copy, Check, Printer, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PrepExportControlsProps {
  onCopyMarkdown: () => Promise<void> | void;
  className?: string;
}

export function PrepExportControls({
  onCopyMarkdown,
  className,
}: PrepExportControlsProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await onCopyMarkdown();
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy briefing:", err);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2.5 print:hidden", className)}
      data-testid="prep-export-controls"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="gap-2 text-xs font-medium h-9"
        aria-label="Copy legal briefing to clipboard as markdown"
        data-testid="prep-copy-markdown-btn"
      >
        {copied ? (
          <>
            <Check size={14} className="text-emerald-600 animate-in zoom-in" aria-hidden="true" />
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Copied Markdown!</span>
          </>
        ) : (
          <>
            <Copy size={14} aria-hidden="true" />
            <span>Copy Briefing (Markdown)</span>
          </>
        )}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handlePrint}
        className="gap-2 text-xs font-medium h-9"
        aria-label="Print legal briefing or export as PDF"
        data-testid="prep-print-btn"
      >
        <Printer size={14} aria-hidden="true" />
        <span>Print / Save PDF</span>
      </Button>
    </div>
  );
}


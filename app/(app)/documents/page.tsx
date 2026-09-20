import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Documents" };

/**
 * Documents page — Phase 0 placeholder.
 * Phase 1 adds: upload form, document list, status badges.
 */
export default function DocumentsPage() {
  return (
    <div className="flex flex-col gap-6 p-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload PDF or DOCX files to analyse their clauses and obligations.
          </p>
        </div>
        {/* Upload button — wired in Phase 1 */}
        <Button disabled className="gap-2">
          <Upload size={16} aria-hidden="true" />
          Upload document
        </Button>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Upload size={24} className="text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="text-base font-medium">No documents yet</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Document upload and analysis will be available in the next phase.
        </p>
      </div>
    </div>
  );
}


import type { Metadata } from "next";
import { GitCompare } from "lucide-react";

export const metadata: Metadata = { title: "Compare" };

/**
 * Compare page — Phase 0 placeholder.
 * Phase 6 implements side-by-side document comparison.
 */
export default function ComparePage() {
  return (
    <div className="flex flex-col gap-6 p-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compare</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare two legal documents side by side to identify key differences.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <GitCompare size={24} className="text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="text-base font-medium">Document comparison</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Coming in a future phase. Upload documents first to enable comparison.
        </p>
      </div>
    </div>
  );
}


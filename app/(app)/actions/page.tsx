import type { Metadata } from "next";
import { Zap } from "lucide-react";

export const metadata: Metadata = { title: "Action Plans" };

/**
 * Actions page — Phase 0 placeholder.
 * Phase 7 implements action plan generation from document findings.
 */
export default function ActionsPage() {
  return (
    <div className="flex flex-col gap-6 p-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Action Plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn document insights into a prioritised action checklist.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Zap size={24} className="text-muted-foreground" aria-hidden="true" />
        </div>
        <h2 className="text-base font-medium">Action plans</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Coming in a future phase. Analyse a document first to generate action items.
        </p>
      </div>
    </div>
  );
}


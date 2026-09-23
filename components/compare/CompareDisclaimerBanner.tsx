"use client";

import * as React from "react";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CompareDisclaimerBannerProps {
  className?: string;
}

export function CompareDisclaimerBanner({ className }: CompareDisclaimerBannerProps) {
  return (
    <aside
      aria-label="Legal Comparison Disclaimer"
      className={cn(
        "rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 sm:p-5 flex items-start gap-3.5 text-blue-950 dark:text-blue-200 shadow-2xs",
        className
      )}
      data-testid="compare-disclaimer-banner"
    >
      <div className="rounded-md bg-blue-500/20 p-2 text-blue-700 dark:text-blue-300 shrink-0 mt-0.5">
        <ShieldAlert size={20} aria-hidden="true" />
      </div>
      <div className="space-y-1 text-xs sm:text-sm leading-relaxed">
        <h2 className="font-semibold text-foreground flex items-center gap-1.5 text-sm sm:text-base">
          <span>Objective Document Comparison</span>
        </h2>
        <p className="text-muted-foreground text-xs leading-normal">
          ClauseWise Compare highlights factual text and metadata differences between two documents for organizational
          review. It is <strong className="font-semibold text-foreground">not legal advice, statutory interpretation, or a risk score</strong>.
          It does not determine which clause or agreement is legally preferable. Always review differences with an
          attorney licensed in your jurisdiction.
        </p>
      </div>
    </aside>
  );
}

export function CompareDisclaimerFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "mt-8 pt-6 border-t text-center text-xs text-muted-foreground space-y-1.5",
        className
      )}
      data-testid="compare-disclaimer-footer"
    >
      <p className="flex items-center justify-center gap-1.5">
        <AlertTriangle size={13} className="text-amber-500 shrink-0" aria-hidden="true" />
        <span>
          <strong>Notice:</strong> Document comparison is strictly informational and objective. No attorney-client relationship is formed.
        </span>
      </p>
      <p>
        Always consult a qualified legal professional before signing modified agreements or accepting terms.
      </p>
    </footer>
  );
}


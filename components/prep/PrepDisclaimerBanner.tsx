"use client";

import * as React from "react";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PrepDisclaimerBannerProps {
  className?: string;
}

export function PrepDisclaimerBanner({ className }: PrepDisclaimerBannerProps) {
  return (
    <aside
      aria-label="Legal Advice Disclaimer"
      className={cn(
        "rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 flex items-start gap-3.5 text-amber-900 dark:text-amber-200 shadow-2xs",
        className
      )}
      data-testid="prep-disclaimer-banner"
    >
      <div className="rounded-md bg-amber-500/20 p-2 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
        <ShieldAlert size={20} aria-hidden="true" />
      </div>
      <div className="space-y-1 text-xs sm:text-sm leading-relaxed">
        <h2 className="font-semibold text-foreground flex items-center gap-1.5 text-sm sm:text-base">
          <span>Organizational & Consultation Briefing Only</span>
        </h2>
        <p className="text-muted-foreground text-xs leading-normal">
          ClauseWise is an organizational and preparation navigator,{" "}
          <strong className="font-semibold text-foreground">not a law firm or legal representative</strong>.
          This briefing is assembled deterministically from your document to help you organize key discussion points,
          questions, and evidence for an attorney licensed in your jurisdiction. It does not constitute legal advice,
          statutory interpretation, or formal risk scoring.
        </p>
      </div>
    </aside>
  );
}

export function PrepDisclaimerFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "mt-8 pt-6 border-t text-center text-xs text-muted-foreground space-y-1.5",
        className
      )}
      data-testid="prep-disclaimer-footer"
    >
      <p className="flex items-center justify-center gap-1.5">
        <AlertTriangle size={13} className="text-amber-500 shrink-0" aria-hidden="true" />
        <span>
          <strong>Notice:</strong> Always review original executed agreements with qualified legal counsel before signing or waiving rights.
        </span>
      </p>
      <p>
        ClauseWise analysis is strictly for informational preparation. No attorney-client relationship is formed.
      </p>
    </footer>
  );
}


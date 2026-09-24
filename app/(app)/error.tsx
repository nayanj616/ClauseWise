"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, RotateCw, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Protected App Error Boundary — ClauseWise (Phase 10)
 * Gracefully contains view or service failures inside the workspace layout shell.
 */
export default function AppError({ error, reset }: AppErrorProps) {
  React.useEffect(() => {
    console.error("[AppError Boundary]:", error.message);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center animate-fade-in">
      <div
        role="alert"
        aria-live="assertive"
        className="mx-auto max-w-lg space-y-4 rounded-xl border border-destructive/30 bg-card p-6 sm:p-8 shadow-sm"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle size={24} aria-hidden="true" />
        </div>

        <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
          Unable to Load Workspace View
        </h2>

        <p className="text-sm text-muted-foreground leading-relaxed">
          We couldn&apos;t load this section of your workspace. Please try refreshing or return to your dashboard.
        </p>

        {error.digest && (
          <p className="font-mono text-[11px] text-muted-foreground/70">
            Reference ID: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={reset}
            className="w-full sm:w-auto gap-2"
          >
            <RotateCw size={14} aria-hidden="true" />
            <span>Try again</span>
          </Button>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full sm:w-auto gap-2"
          >
            <Link href="/dashboard">
              <LayoutDashboard size={14} aria-hidden="true" />
              <span>Back to Dashboard</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}


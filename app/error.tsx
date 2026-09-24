"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/Logo";

export interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root Error Boundary — ClauseWise (Phase 10)
 * Catches unhandled runtime exceptions gracefully without exposing internal database or stack traces.
 */
export default function GlobalError({ error, reset }: ErrorProps) {
  React.useEffect(() => {
    // Log sanitized error in server/monitoring telemetry
    console.error("[GlobalError Boundary]:", error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center animate-fade-in bg-background">
      <div className="mb-6">
        <Logo size="lg" />
      </div>

      <div
        role="alert"
        aria-live="assertive"
        className="mx-auto max-w-md space-y-4 rounded-xl border border-destructive/30 bg-card p-8 shadow-sm"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle size={28} aria-hidden="true" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          An Unexpected Error Occurred
        </h1>

        <p className="text-sm text-muted-foreground leading-relaxed">
          ClauseWise encountered a temporary issue while loading this resource. No document data was compromised.
        </p>

        {error.digest && (
          <p className="font-mono text-[11px] text-muted-foreground/70">
            Error Reference: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
          <Button
            type="button"
            variant="default"
            onClick={reset}
            className="w-full sm:w-auto gap-2"
          >
            <RotateCw size={15} aria-hidden="true" />
            <span>Try again</span>
          </Button>

          <Button
            asChild
            variant="outline"
            className="w-full sm:w-auto gap-2"
          >
            <Link href="/dashboard">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Back to Dashboard</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}


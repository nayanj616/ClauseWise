import Link from "next/link";
import { FileQuestion, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/Logo";

/**
 * Global 404 Not Found Page — ClauseWise (Phase 10)
 * Renders a clean, accessible error screen when a route or resource does not exist.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center animate-fade-in bg-background">
      <div className="mb-6">
        <Logo size="lg" />
      </div>

      <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-8 shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileQuestion size={28} aria-hidden="true" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Page or Resource Not Found
        </h1>

        <p className="text-sm text-muted-foreground leading-relaxed">
          The legal document, analysis, or page you requested does not exist or may have been removed.
        </p>

        <div className="pt-2">
          <Button asChild className="gap-2">
            <Link href="/dashboard">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Back to Dashboard</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}


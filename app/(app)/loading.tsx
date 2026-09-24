import { Skeleton } from "@/components/ui/skeleton";

/**
 * Default Loading Skeleton for protected app routes (Phase 10).
 * Marked with role="status" and aria-busy="true" for screen reader compliance.
 */
export default function AppLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading workspace content"
      className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in max-w-7xl w-full mx-auto"
    >
      <span className="sr-only">Loading content…</span>

      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 sm:w-64" />
        <Skeleton className="h-4 w-72 sm:w-96" />
      </div>

      {/* Content Skeleton Card */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}


import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard Loading Skeleton — ClauseWise (Phase 10)
 * Replicates the metrics cards, quick actions, and recent documents layout.
 */
export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard"
      className="flex flex-col gap-8 p-4 sm:p-6 lg:p-8 animate-fade-in max-w-7xl w-full mx-auto"
    >
      <span className="sr-only">Loading dashboard…</span>

      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Disclaimer banner skeleton */}
      <Skeleton className="h-16 w-full rounded-lg" />

      {/* Stats summary grid skeleton (3 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-16" />
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-16" />
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>

      {/* Quick actions skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <Skeleton className="h-10 w-10 rounded-md" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-full rounded-md pt-2" />
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <Skeleton className="h-10 w-10 rounded-md" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-full rounded-md pt-2" />
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <Skeleton className="h-10 w-10 rounded-md" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-full rounded-md pt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}


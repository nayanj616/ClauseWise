import { Skeleton } from "@/components/ui/skeleton";

/**
 * Action Center Loading Skeleton — ClauseWise (Phase 10)
 */
export default function ActionsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading action items"
      className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in max-w-7xl w-full mx-auto"
    >
      <span className="sr-only">Loading actions…</span>

      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Filter Tabs Skeleton */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Actions Checklist Skeleton */}
      <div className="space-y-3">
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-56" />
          </div>
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}


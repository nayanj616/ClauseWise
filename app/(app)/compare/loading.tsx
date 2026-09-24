import { Skeleton } from "@/components/ui/skeleton";

/**
 * Compare Documents Loading Skeleton — ClauseWise (Phase 10)
 */
export default function CompareLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading document comparison"
      className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 animate-fade-in max-w-7xl w-full mx-auto"
    >
      <span className="sr-only">Loading comparison…</span>

      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Disclaimer banner skeleton */}
      <Skeleton className="h-16 w-full rounded-lg" />

      {/* Document Selector Pair Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border bg-card p-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>

      {/* Diff cards skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-6 w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}


import { Skeleton } from "@/components/ui/skeleton";

/**
 * Documents Library Loading Skeleton — ClauseWise (Phase 10)
 */
export default function DocumentsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading document library"
      className="flex flex-col gap-8 p-4 sm:p-6 lg:p-8 animate-fade-in max-w-7xl w-full mx-auto"
    >
      <span className="sr-only">Loading documents…</span>

      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* Upload Zone Skeleton */}
      <div className="rounded-xl border-2 border-dashed p-8 text-center space-y-4">
        <Skeleton className="mx-auto h-12 w-12 rounded-full" />
        <Skeleton className="mx-auto h-5 w-60" />
        <Skeleton className="mx-auto h-4 w-80 max-w-full" />
        <Skeleton className="mx-auto h-9 w-36 rounded-md" />
      </div>

      {/* Documents Table Skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}


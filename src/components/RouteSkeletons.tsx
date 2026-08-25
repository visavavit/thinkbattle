import { Skeleton } from "@/components/ui/skeleton";

/** Generic shell shown while a route without its own skeleton is loading. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <CardGridSkeleton count={6} />
    </div>
  );
}

/** Matches the browse layout: heading, filter panel, then the card grid. */
export function BrowseSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <section className="arena-panel space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_11rem]">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </section>

      <Skeleton className="h-4 w-32" />
      <CardGridSkeleton count={6} />
    </div>
  );
}

function CardGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="arena-panel space-y-3 p-4">
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-2.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

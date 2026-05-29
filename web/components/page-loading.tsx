import { cn } from "@/lib/utils";

export function PageLoading({ className }: { className?: string }) {
  return (
    <div className={cn("anim-in space-y-6", className)} aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <div className="h-8 w-48 max-w-[70%] animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 max-w-[90%] animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/30 px-4 py-3">
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3">
              <div className="h-4 flex-1 animate-pulse rounded bg-muted/80" />
              <div className="h-4 w-20 animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

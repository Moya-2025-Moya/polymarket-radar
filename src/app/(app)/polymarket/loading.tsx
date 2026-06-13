// Instant skeleton: shown the moment you click the tab, while the server fetches
// markets. Without it the navigation blocks on ~1000 markets + volume batches.
export default function Loading() {
  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-2">
      <div className="h-10 animate-pulse rounded-lg border border-hairline bg-surface" />
      <div className="grid min-h-0 flex-1 grid-cols-[16rem_minmax(0,1fr)_22rem] gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
        <div className="space-y-2 bg-bg p-3">
          <div className="h-7 animate-pulse rounded bg-elevated" />
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-elevated/60" />
          ))}
        </div>
        <div className="space-y-4 bg-bg px-6 py-5">
          <div className="h-6 w-2/3 animate-pulse rounded bg-elevated" />
          <div className="h-24 animate-pulse rounded bg-elevated/60" />
          <div className="h-28 animate-pulse rounded bg-elevated/40" />
        </div>
        <div className="space-y-3 bg-bg px-5 py-5">
          <div className="h-8 animate-pulse rounded bg-elevated" />
          <div className="h-32 animate-pulse rounded bg-elevated/50" />
        </div>
      </div>
    </div>
  );
}

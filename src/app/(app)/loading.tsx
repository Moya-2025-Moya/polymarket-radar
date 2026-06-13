// Generic instant skeleton for every (app) route without its own loading.tsx.
// Next shows this the moment you click a tab, while the server renders the page -
// so navigation feels instant instead of hanging on the old page.
export default function Loading() {
  return (
    <div>
      <div className="mb-8 h-7 w-40 animate-pulse rounded bg-elevated" />
      <div className="h-20 animate-pulse rounded-xl border border-hairline bg-surface" />
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="h-40 animate-pulse rounded-lg bg-elevated/50" />
        <div className="h-40 animate-pulse rounded-lg bg-elevated/40" />
      </div>
      <div className="mt-10 h-48 animate-pulse rounded-lg bg-elevated/40" />
    </div>
  );
}

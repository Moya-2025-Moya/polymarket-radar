import { PageHeader } from "@/components/ui/PageHeader";

export default function Loading() {
  return (
    <div>
      <PageHeader title="Polymarket" />
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="h-28 animate-pulse rounded-lg bg-elevated/40" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-40 animate-pulse rounded-lg bg-elevated/40" />
          <div className="h-40 animate-pulse rounded-lg bg-elevated/40" />
        </div>
        <div className="h-28 animate-pulse rounded-lg bg-elevated/40" />
      </div>
    </div>
  );
}

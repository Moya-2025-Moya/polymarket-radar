import { PageHeader } from "@/components/ui/PageHeader";

export default function Loading() {
  return (
    <div>
      <PageHeader title="Traders" />
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-elevated/40" />
          ))}
        </div>
        <div className="space-y-2.5">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-elevated/40" />
          ))}
        </div>
      </div>
    </div>
  );
}

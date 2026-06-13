import { PageHeader } from "@/components/ui/PageHeader";

export default function Loading() {
  return (
    <div>
      <PageHeader title="Underdog" />
      <div className="mx-auto max-w-5xl space-y-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-elevated/40" />
        ))}
      </div>
    </div>
  );
}

import { PageHeader } from "@/components/ui/PageHeader";
import { PolymarketHome } from "@/components/polymarket/PolymarketHome";

// Thin shell - the digest fetches its own data (cached, volume-floored) client-side.
export default function PolymarketOverviewPage() {
  return (
    <div>
      <PageHeader title="Polymarket" />
      <PolymarketHome />
    </div>
  );
}

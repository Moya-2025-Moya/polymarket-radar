import { PageHeader } from "@/components/ui/PageHeader";
import { TradersBoard } from "@/components/polymarket/TradersBoard";

// Thin shell - the board fetches its own data (cached, volume-floored) client-side.
export default function TradersPage() {
  return (
    <div>
      <PageHeader title="Traders" />
      <TradersBoard />
    </div>
  );
}

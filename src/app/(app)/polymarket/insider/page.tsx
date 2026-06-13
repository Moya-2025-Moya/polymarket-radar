import { PageHeader } from "@/components/ui/PageHeader";
import { InsiderBoard } from "@/components/polymarket/InsiderBoard";

// Thin shell - the board fetches its own data (cached, volume-floored) client-side.
export default function InsiderPage() {
  return (
    <div>
      <PageHeader title="Insider scan" />
      <InsiderBoard />
    </div>
  );
}

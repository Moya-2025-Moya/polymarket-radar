import { PageHeader } from "@/components/ui/PageHeader";
import { UnderdogBoard } from "@/components/polymarket/UnderdogBoard";

// Thin shell - the board fetches its own data (cached, volume-floored) client-side.
export default function UnderdogPage() {
  return (
    <div>
      <PageHeader title="Underdog" />
      <UnderdogBoard />
    </div>
  );
}

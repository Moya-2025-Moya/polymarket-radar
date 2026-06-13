import { PageHeader, Pending } from "@/components/ui/PageHeader";
import { MarketBrowser } from "@/components/polymarket/MarketBrowser";
import type { MarketWithVol } from "@/components/polymarket/MarketSelector";
import { polymarket } from "@/lib/polymarket";

export default async function PolymarketPage() {
  let markets: MarketWithVol[] = [];
  let error: string | null = null;

  try {
    const page = await polymarket.samplingMarkets();
    const tradeable = page.data.filter(
      (m) => m.active && !m.closed && m.accepting_orders,
    );
    // Exact per-market signals (24h volume + volume-spike + weekly price move)
    // joined by condition_id for the markets we actually show.
    const signals = await polymarket.marketSignals(
      tradeable.map((m) => m.condition_id),
    );
    markets = tradeable
      // Slim each market to ONLY the fields the client uses. Spreading `...m`
      // dragged the full raw clob object into the page HTML (description 405KB,
      // rewards/image/icon ~180KB, etc. - none of it rendered). description is
      // dropped here and lazy-fetched for the selected market in MarketView.
      .map((m) => {
        const s = signals[m.condition_id];
        return {
          condition_id: m.condition_id,
          question: m.question,
          market_slug: m.market_slug,
          active: m.active,
          closed: m.closed,
          accepting_orders: m.accepting_orders,
          neg_risk: m.neg_risk,
          minimum_tick_size: m.minimum_tick_size,
          minimum_order_size: m.minimum_order_size,
          end_date_iso: m.end_date_iso,
          tags: m.tags,
          tokens: m.tokens,
          volume: s?.volume ?? 0,
          spike: s?.spike ?? 0,
          priceChange: s?.chg ?? 0,
        };
      })
      .sort((a, b) => b.volume - a.volume)
      // Top 500 by volume - covers all liquid markets; the dust tail isn't traded.
      .slice(0, 500);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Polymarket" />
        <div className="text-sm text-neg">
          Couldn&apos;t reach Polymarket - {error}. If you&apos;re in a
          geo-restricted region, set POLYMARKET_PROXY_URL to your own proxy.
        </div>
      </div>
    );
  }
  if (markets.length === 0) {
    return (
      <div>
        <PageHeader title="Polymarket" />
        <Pending note="No tradeable markets right now." />
      </div>
    );
  }
  return <MarketBrowser markets={markets} />;
}

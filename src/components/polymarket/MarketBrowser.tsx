"use client";

import { useEffect, useMemo, useState } from "react";
import type { PmBook } from "@/lib/polymarket";
import { MarketSelector, type MarketWithVol } from "./MarketSelector";
import { MarketView } from "./MarketView";

// Read-only market browser: pick a market on the left, see its live prices,
// order-book depth, price history, and smart-money on the right. No order entry.
export function MarketBrowser({ markets }: { markets: MarketWithVol[] }) {
  const [selectedId, setSelectedId] = useState(markets[0]?.condition_id ?? "");
  const [books, setBooks] = useState<Record<string, PmBook | null>>({});

  const selected = useMemo(
    () => markets.find((m) => m.condition_id === selectedId),
    [markets, selectedId],
  );
  const loadable = useMemo(
    () => new Set(markets.map((m) => m.condition_id)),
    [markets],
  );

  // Poll the order books for the selected market's outcome tokens.
  useEffect(() => {
    const market = markets.find((m) => m.condition_id === selectedId);
    if (!market) return;
    let alive = true;
    const tokenIds = market.tokens.map((t) => t.token_id);

    async function load() {
      const entries = await Promise.all(
        tokenIds.map(async (id) => {
          try {
            const r = await fetch(
              `/api/pm/book?token_id=${encodeURIComponent(id)}`,
              { cache: "no-store" },
            );
            return [id, r.ok ? ((await r.json()) as PmBook) : null] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      if (alive) setBooks(Object.fromEntries(entries));
    }

    void load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selectedId, markets]);

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-6">
      <div className="w-80 shrink-0 overflow-y-auto rounded-lg border border-hairline">
        <MarketSelector
          markets={markets}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto pr-1">
        <MarketView
          market={selected}
          books={books}
          onJump={setSelectedId}
          loadable={loadable}
        />
      </div>
    </div>
  );
}

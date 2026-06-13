"use client";

import { useMemo, useState } from "react";
import type { PmMarket } from "@/lib/polymarket";
import { useWatchlist, toggleWatch } from "@/lib/pm-watchlist";
import { nowMs } from "@/lib/polymarket-exec";
import { endLabel } from "@/lib/market-time";

// volume = 24h. spike = 24h volume / weekly daily-average (>1 = busier than usual).
// priceChange = probability move over the trailing week.
export type MarketWithVol = PmMarket & { volume: number; spike?: number; priceChange?: number };

const fmtVol = (n: number) => {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

// Anomaly thresholds. A market is a "mover" when it's liquid enough to matter AND
// either its volume is spiking vs its own weekly norm, or its probability has
// swung hard over the week. Min-volume gate keeps dust markets (whose ratios are
// noise) out of the scan.
const MOVER_MIN_VOL = 5_000;
const SPIKE_MIN = 2.5;
const CHG_MIN = 0.12;

type MoverFlags = { spike: number; chg: number; spiking: boolean; moving: boolean; isMover: boolean };
function moverFlags(m: MarketWithVol): MoverFlags {
  const spike = m.spike ?? 0;
  const chg = m.priceChange ?? 0;
  const liquid = (m.volume ?? 0) >= MOVER_MIN_VOL;
  const spiking = liquid && spike >= SPIKE_MIN;
  const moving = liquid && Math.abs(chg) >= CHG_MIN;
  return { spike, chg, spiking, moving, isMover: spiking || moving };
}
// Rank: volume spike dominates, a big weekly swing nudges a market up.
const moverScore = (m: MarketWithVol) => (m.spike ?? 0) + Math.abs(m.priceChange ?? 0) * 8;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const spikeLabel = (s: number) => (s >= 10 ? "10×+" : `${s.toFixed(1)}×`);

// Plain-language "how is it moving" for a mover. Weekly change lets us reconstruct
// where the probability came from (now − change = a week ago), so we can show the
// actual from→to, not just a delta. Volume spikes report how far above the norm.
function describeMove(m: MarketWithVol): string {
  const f = moverFlags(m);
  const parts: string[] = [];
  if (f.spiking) parts.push(`vol ${spikeLabel(f.spike)} normal`);
  if (f.moving) {
    const to = yesPrice(m);
    const from = Math.min(1, Math.max(0, to - f.chg));
    const dir = f.chg >= 0 ? "↑" : "↓";
    parts.push(`Yes ${pct(from)}${dir}${pct(to)} (${f.chg >= 0 ? "+" : ""}${Math.round(f.chg * 100)}pt/wk)`);
  }
  return parts.join("  ·  ");
}

type Filter = "all" | "movers" | "watch" | "held";
type Sort = "vol" | "movers" | "prob" | "ending";

// Render only the top slice - a 1000-row DOM list is the main jank on this page.
// The list is sorted + searchable, so refine instead of scrolling thousands.
const RENDER_CAP = 100;

const yesPrice = (m: PmMarket) =>
  (m.tokens.find((t) => /yes/i.test(t.outcome)) ?? m.tokens[0])?.price ?? 0;

const selectCls =
  "rounded border border-border bg-elevated px-1.5 py-1 text-[11px] text-foreground focus:border-accent focus:outline-none";

export function MarketSelector({
  markets,
  selectedId,
  onSelect,
  held,
}: {
  markets: MarketWithVol[];
  selectedId: string;
  onSelect: (id: string) => void;
  held?: Set<string>;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("vol");
  const [category, setCategory] = useState("all");
  const watch = useWatchlist();

  // Category options = most common tags across the tradeable set.
  const categories = useMemo(() => {
    const freq = new Map<string, number>();
    for (const mk of markets) for (const t of mk.tags ?? []) freq.set(t, (freq.get(t) ?? 0) + 1);
    return [...freq.entries()]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([t]) => t);
  }, [markets]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = markets.filter((m) => {
      if (filter === "movers" && !moverFlags(m).isMover) return false;
      if (filter === "watch" && !watch.has(m.condition_id)) return false;
      if (filter === "held" && !held?.has(m.condition_id)) return false;
      if (category !== "all" && !(m.tags ?? []).includes(category)) return false;
      if (needle && !m.question.toLowerCase().includes(needle)) return false;
      return true;
    });
    out.sort((a, b) => {
      if (sort === "movers") return moverScore(b) - moverScore(a);
      if (sort === "prob") return yesPrice(b) - yesPrice(a);
      if (sort === "ending") {
        const ta = a.end_date_iso ? Date.parse(a.end_date_iso) : Infinity;
        const tb = b.end_date_iso ? Date.parse(b.end_date_iso) : Infinity;
        return ta - tb;
      }
      return b.volume - a.volume;
    });
    return out;
  }, [markets, q, filter, sort, category, watch, held]);

  const moversCount = useMemo(() => markets.filter((m) => moverFlags(m).isMover).length, [markets]);
  const counts = { movers: moversCount, watch: watch.size, held: held?.size ?? 0 };

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 space-y-2.5 border-b border-hairline bg-bg p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search markets…"
          className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-foreground placeholder:text-faint focus:border-accent focus:outline-none"
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-1 text-[11px]">
          {([
            ["all", "All"],
            ["movers", `Movers ${counts.movers || ""}`.trim()],
            ["watch", `★ ${counts.watch || ""}`.trim()],
            ["held", `Held ${counts.held || ""}`.trim()],
          ] as [Filter, string][]).map(([key, label]) => {
            const isMoversChip = key === "movers";
            return (
              <button
                key={key}
                onClick={() => {
                  setFilter(key);
                  // Movers is a scan - default it to the anomaly ranking.
                  if (isMoversChip) setSort("movers");
                }}
                className={`rounded px-2 py-0.5 uppercase tracking-wide ${
                  filter === key
                    ? isMoversChip
                      ? "bg-warn/15 text-warn"
                      : "bg-elevated text-accent"
                    : isMoversChip && counts.movers
                      ? "text-warn/70 hover:text-warn"
                      : "text-faint hover:text-foreground"
                }`}
                title={isMoversChip ? "Markets with unusual volume or a big weekly swing" : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={selectCls} title="Sort">
            <option value="vol">Vol ↓</option>
            <option value="movers">Movers ↓</option>
            <option value="prob">Prob ↓</option>
            <option value="ending">Ending ↑</option>
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${selectCls} min-w-0 flex-1`} title="Category">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ul className="flex-1">
        {filtered.slice(0, RENDER_CAP).map((m) => {
          const now = nowMs();
          const end = endLabel(m.end_date_iso, now);
          const active = m.condition_id === selectedId;
          const vol = fmtVol(m.volume);
          const prob = yesPrice(m);
          const owned = held?.has(m.condition_id);
          const starred = watch.has(m.condition_id);
          const mv = moverFlags(m);
          // In the Movers scan, spell out how each market is moving instead of a badge.
          const showSubline = filter === "movers" && mv.isMover;
          return (
            <li key={m.condition_id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(m.condition_id)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(m.condition_id)}
                className={`group relative flex cursor-pointer items-center gap-2 border-b border-hairline px-4 py-2.5 transition-colors ${
                  active ? "bg-elevated" : "hover:bg-elevated/50"
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-accent" />}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWatch(m.condition_id);
                  }}
                  title={starred ? "Unwatch" : "Watch"}
                  className={`shrink-0 text-sm leading-none ${
                    starred ? "text-accent" : "text-faint opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {starred ? "★" : "☆"}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs leading-snug text-foreground">{m.question}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[10px]">
                    {end && (
                      <span className={end.urgent ? "text-neg" : "text-faint"}>{end.text}</span>
                    )}
                    {showSubline && (
                      <span className="truncate text-faint">{end ? "· " : ""}{describeMove(m)}</span>
                    )}
                  </span>
                </span>
                {!showSubline && mv.spiking && (
                  <span
                    className="shrink-0 rounded bg-warn/15 px-1 font-mono text-[10px] tabular-nums text-warn"
                    title={`24h volume is ${mv.spike.toFixed(1)}× its weekly daily average`}
                  >
                    {spikeLabel(mv.spike)}
                  </span>
                )}
                {!showSubline && mv.moving && (
                  <span
                    className={`shrink-0 rounded px-1 font-mono text-[10px] tabular-nums ${
                      mv.chg >= 0 ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg"
                    }`}
                    title="Probability move over the past week"
                  >
                    {mv.chg >= 0 ? "+" : ""}
                    {Math.round(mv.chg * 100)}pt
                  </span>
                )}
                {owned && <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-accent" title="You hold a position" />}
                <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">{Math.round(prob * 100)}%</span>
                {vol && (
                  <span className="shrink-0 rounded bg-elevated px-1 font-mono text-[10px] text-faint">{vol}</span>
                )}
                <span className="absolute bottom-0 left-0 h-[2px] bg-pos/50" style={{ width: `${prob * 100}%` }} />
              </div>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-3 py-3 text-xs text-faint">
            {filter === "movers"
              ? "Nothing unusual right now - no volume spikes or big weekly swings."
              : filter === "watch"
                ? "No watched markets."
                : filter === "held"
                  ? "No open positions."
                  : "No markets match."}
          </li>
        )}
        {filtered.length > RENDER_CAP && (
          <li className="px-3 py-3 text-center text-[11px] text-faint">
            Showing top {RENDER_CAP} of {filtered.length} - search or filter to narrow.
          </li>
        )}
      </ul>
    </div>
  );
}

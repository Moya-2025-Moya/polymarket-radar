"use client";

import { useEffect, useRef, useState } from "react";
import type { PmBook, PmToken } from "@/lib/polymarket";
import type { MarketWithVol } from "./MarketSelector";
import { bestBid, bestAsk, mid, nowMs } from "@/lib/polymarket-exec";
import { PriceChart } from "./PriceChart";
import { SmartMoney } from "./SmartMoney";

const isYes = (t: PmToken) => /yes/i.test(t.outcome);

const DAY = 86_400_000;

/** Absolute date + human "time left" for a market's resolution. */
function endInfo(iso: string | null): { abs: string; rel: string; ended: boolean } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const abs = new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const diff = t - nowMs();
  if (diff <= 0) return { abs, rel: "ended", ended: true };
  const days = Math.floor(diff / DAY);
  const rel =
    days >= 1
      ? `in ${days}d`
      : `in ${Math.max(1, Math.floor(diff / 3_600_000))}h`;
  return { abs, rel, ended: false };
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function MarketView({
  market,
  books,
  onJump,
  loadable,
}: {
  market?: MarketWithVol;
  books: Record<string, PmBook | null>;
  onJump?: (cid: string) => void;
  loadable?: Set<string>;
}) {
  // Resolution text is stripped from the market-list payload (it's 400KB+ across
  // the list). Use it if present, else lazy-fetch the full market for the
  // selected one only. Hooks run before the early return (rules of hooks).
  const condId = market?.condition_id;
  const inlineDesc = market?.description;
  const [resolution, setResolution] = useState(inlineDesc ?? "");
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (inlineDesc) {
      setResolution(inlineDesc);
      return;
    }
    setResolution("");
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!condId) return;
    let alive = true;
    fetch(`/api/pm/markets/${condId}`, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && typeof d?.description === "string") setResolution(d.description);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [condId, inlineDesc]);

  if (!market) {
    return <p className="text-sm text-muted">Select a market on the left.</p>;
  }

  const end = endInfo(market.end_date_iso);
  const status = market.closed
    ? { label: "closed", tone: "text-neg" }
    : market.accepting_orders
      ? { label: "trading", tone: "text-pos" }
      : { label: "paused", tone: "text-warn" };

  const yes = market.tokens.find(isYes) ?? market.tokens[0];
  const no = market.tokens.find((t) => t !== yes) ?? market.tokens[1];
  const yesBook = yes ? books[yes.token_id] : null;
  const bid = bestBid(yesBook);
  const ask = bestAsk(yesBook);
  const spread = bid != null && ask != null ? ask - bid : null;

  // Headline prices track the live book mid (falls back to the server snapshot).
  const yesPx = yes ? mid(yesBook) ?? yes.price : null;
  const noPx = no ? mid(books[no.token_id]) ?? no.price : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-xl leading-snug tracking-tight text-foreground">
          {market.question}
          {market.neg_risk && <span className="ml-2 align-middle text-xs text-warn">neg-risk</span>}
        </h1>
        {/* Meta row: status · resolution date · 24h volume */}
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs">
          <span className={status.tone}>● {status.label}</span>
          {end && (
            <span className="text-muted">
              Ends{" "}
              <span className="text-foreground">{end.abs}</span>{" "}
              <span className={end.ended ? "text-neg" : "text-faint"}>({end.rel})</span>
            </span>
          )}
          <span className="text-muted">
            24h vol <span className="text-foreground">{fmtVol(market.volume)}</span>
          </span>
          {market.volume >= 5000 && (market.spike ?? 0) >= 2.5 && (
            <span className="text-warn" title="24h volume vs this market's weekly daily average">
              {(market.spike ?? 0) >= 10 ? "10×+" : `${(market.spike ?? 0).toFixed(1)}×`} normal volume
            </span>
          )}
          {market.volume >= 5000 && Math.abs(market.priceChange ?? 0) >= 0.12 && yesPx != null && (
            <span className={(market.priceChange ?? 0) >= 0 ? "text-pos" : "text-neg"}>
              Yes {Math.round(Math.min(1, Math.max(0, yesPx - (market.priceChange ?? 0))) * 100)}%
              {(market.priceChange ?? 0) >= 0 ? "↑" : "↓"}
              {Math.round(yesPx * 100)}% this week
              {" ("}
              {(market.priceChange ?? 0) >= 0 ? "+" : ""}
              {Math.round((market.priceChange ?? 0) * 100)}pt)
            </span>
          )}
        </div>
      </div>

      {/* Big outcome prices - live from the book, flash on change */}
      <div className="flex flex-wrap items-end gap-x-12 gap-y-4">
        {yes && yesPx != null && <PriceBlock outcome={yes.outcome} price={yesPx} tone="pos" />}
        {no && noPx != null && <PriceBlock outcome={no.outcome} price={noPx} tone="neg" />}
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-muted">Spread</div>
          <div className="mt-1 font-mono text-xl text-foreground">
            {spread != null ? spread.toFixed(3) : "-"}
          </div>
        </div>
      </div>

      {/* Probability history */}
      {yes && <PriceChart tokenId={yes.token_id} label={yes.outcome} />}

      {/* Order books (read-only depth) */}
      <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
        {market.tokens.map((t) => (
          <DepthLadder key={t.token_id} book={books[t.token_id]} label={t.outcome} />
        ))}
      </div>

      {/* Who's trading this market - sharp money, flow, entry habits */}
      <SmartMoney conditionId={market.condition_id} onJump={onJump} loadable={loadable} />

      {/* Resolution criteria - the text that decides who wins (lazy-loaded) */}
      {resolution && (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
            Resolution
          </div>
          <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed text-foreground/80">
            {resolution}
          </p>
        </div>
      )}
    </div>
  );
}

function PriceBlock({
  outcome,
  price,
  tone,
}: {
  outcome: string;
  price: number;
  tone: "pos" | "neg";
}) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef(price);

  useEffect(() => {
    const dir = price > prev.current ? "up" : price < prev.current ? "down" : null;
    prev.current = price;
    if (!dir) return;
    setFlash(dir);
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [price]);

  const numColor =
    flash === "up" ? "text-pos" : flash === "down" ? "text-neg" : "text-foreground";

  return (
    <div>
      <div className={`text-xs uppercase tracking-[0.14em] ${tone === "pos" ? "text-pos" : "text-neg"}`}>
        {outcome}
      </div>
      <div className={`mt-1 font-mono text-4xl tracking-tight transition-colors duration-500 ${numColor}`}>
        {price.toFixed(2)}
      </div>
    </div>
  );
}

function DepthLadder({ book, label }: { book: PmBook | null; label: string }) {
  const asks = (book?.asks ?? [])
    .map((l) => ({ p: +l.price, s: +l.size }))
    .sort((a, b) => a.p - b.p)
    .slice(0, 8);
  const bids = (book?.bids ?? [])
    .map((l) => ({ p: +l.price, s: +l.size }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 8);
  const maxSize = Math.max(1, ...asks.map((a) => a.s), ...bids.map((b) => b.s));

  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">{label}</div>
      {!book || (!asks.length && !bids.length) ? (
        <p className="text-sm text-faint">No resting orders.</p>
      ) : (
        <div className="font-mono text-xs">
          {[...asks].reverse().map((a, i) => (
            <Row key={`a${i}`} price={a.p} size={a.s} max={maxSize} side="ask" />
          ))}
          <div className="my-0.5 border-y border-hairline" />
          {bids.map((b, i) => (
            <Row key={`b${i}`} price={b.p} size={b.s} max={maxSize} side="bid" />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  price,
  size,
  max,
  side,
}: {
  price: number;
  size: number;
  max: number;
  side: "bid" | "ask";
}) {
  const pct = Math.max(2, (size / max) * 100);
  const barColor = side === "ask" ? "rgba(226,103,79,0.18)" : "rgba(84,201,138,0.18)";
  const priceColor = side === "ask" ? "text-neg" : "text-pos";
  return (
    <div className="relative flex w-full items-center justify-between py-0.5">
      <div
        className="absolute inset-y-0 right-0 rounded-sm"
        style={{ width: `${pct}%`, background: barColor }}
      />
      <span className={`relative ${priceColor}`}>{price.toFixed(3)}</span>
      <span className="relative text-muted">{size.toFixed(0)}</span>
    </div>
  );
}

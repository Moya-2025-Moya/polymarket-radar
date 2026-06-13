"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketSmartMoney, SharpTrader, WalletBook } from "@/lib/pm-smart";
import { useSharpConfig, setSharpConfig } from "@/lib/pm-sharp-config";
import { nowMs } from "@/lib/polymarket-exec";
import { Hint } from "@/components/ui/Hint";
import { useTrackedWallets, isTracked, toggleTracked } from "@/lib/pm-tracked-wallets";

const fmtUsd = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}M` : a >= 1_000 ? `${(a / 1_000).toFixed(1)}k` : `${a.toFixed(0)}`;
  return `${n < 0 ? "-" : ""}$${s}`;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const pts = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}pt`;
const ago = (ts: number, now: number) => {
  const s = Math.max(0, now - ts);
  if (s < 90) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

type SortKey = "size" | "value" | "win" | "edge";

export function SmartMoney({
  conditionId,
  onJump,
  loadable,
}: {
  conditionId: string;
  onJump?: (cid: string) => void;
  loadable?: Set<string>;
}) {
  const cfg = useSharpConfig();
  const [data, setData] = useState<MarketSmartMoney | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<SortKey>("size");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("loading");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(null);
    fetch(`/api/pm-smart/market?cid=${encodeURIComponent(conditionId)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || r.status))))
      .then((d: MarketSmartMoney) => {
        if (!alive) return;
        setData(d);
        setState("ok");
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e));
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [conditionId]);

  const now = Math.floor(nowMs() / 1000);
  const isSharp = (t: SharpTrader) => t.recordKnown && t.bets >= cfg.minBets && t.winRate >= cfg.minWinRate;

  const habits = useMemo(() => {
    const sharp = (data?.traders ?? []).filter(isSharp);
    if (!sharp.length || !data) return null;
    let wUsd = 0;
    let wEntry = 0;
    let net = 0;
    let total = 0;
    for (const t of sharp) {
      total += t.marketUsd;
      if (t.avgEntry > 0) {
        wUsd += t.marketUsd;
        wEntry += t.avgEntry * t.marketUsd;
      }
      net += (t.sideIndex === 0 ? 1 : -1) * t.netUsd;
    }
    const avgEntry = wUsd > 0 ? wEntry / wUsd : 0;
    const sideIndex = net >= 0 ? 0 : 1;
    const side = data.outcomes[sideIndex] ?? (sideIndex === 0 ? "Yes" : "No");
    const curSide = data.curYesKnown ? (sideIndex === 0 ? data.curYes : 1 - data.curYes) : 0;
    const edge = data.curYesKnown && avgEntry > 0 ? curSide - avgEntry : null;
    return { count: sharp.length, avgEntry, side, sideIndex, total, edge };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cfg.minBets, cfg.minWinRate]);

  const sorted = useMemo(() => {
    const list = [...(data?.traders ?? [])];
    list.sort((a, b) => {
      if (sort === "value") return b.value - a.value;
      if (sort === "win") return b.winRate - a.winRate || b.bets - a.bets;
      if (sort === "edge") return (b.unrealized ?? -9) - (a.unrealized ?? -9);
      return b.marketUsd - a.marketUsd;
    });
    // Sharp money always floats to the top within the chosen sort.
    return list.sort((a, b) => Number(isSharp(b)) - Number(isSharp(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sort, cfg.minBets, cfg.minWinRate]);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Smart money</div>
        {data && (
          <div className="font-mono text-[10px] text-faint">
            {data.sampledTrades} fills · {data.flow.traderCount} wallets
          </div>
        )}
      </div>

      {state === "loading" && <Skeleton />}
      {state === "error" && <div className="text-sm text-neg">Couldn&apos;t read smart money. {err}</div>}

      {state === "ok" && data && (
        <div className="space-y-5">
          <FlowGauge data={data} />

          {/* Sharp cohort + adjustable bar */}
          <div className="rounded-xl border border-hairline bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {habits ? (
                <div className="text-sm">
                  <span className="font-mono text-accent">{habits.count}</span> sharp{" "}
                  {habits.count > 1 ? "wallets" : "wallet"} · net{" "}
                  <span className={habits.sideIndex === 0 ? "text-pos" : "text-neg"}>{habits.side}</span> · entry{" "}
                  <span className="font-mono text-foreground">{habits.avgEntry.toFixed(2)}</span>
                  {habits.edge != null && (
                    <span className={habits.edge >= 0 ? "text-pos" : "text-neg"}> · {pts(habits.edge)} now</span>
                  )}{" "}
                  · <span className="font-mono text-foreground">{fmtUsd(habits.total)}</span> in
                </div>
              ) : (
                <div className="text-sm text-muted">No wallet here clears the bar.</div>
              )}
              <div className="flex items-center gap-2 font-mono text-[11px] text-faint">
                <Stepper
                  value={cfg.minBets}
                  onChange={(v) => setSharpConfig({ minBets: Math.max(0, v) })}
                  suffix="bets"
                />
                <Stepper
                  value={Math.round(cfg.minWinRate * 100)}
                  onChange={(v) => setSharpConfig({ minWinRate: Math.min(1, Math.max(0, v / 100)) })}
                  suffix="% win"
                  step={5}
                />
              </div>
            </div>
          </div>

          {/* Trader list - sortable, sharp floated up, expandable into the book */}
          <div>
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3 border-b border-hairline pb-1.5 font-mono text-[10px] uppercase tracking-wide text-faint">
              <span>Trader</span>
              <SortTh label="Size" k="size" sort={sort} set={setSort} hint="Total dollars this wallet has traded in THIS market (their stake here). Sorts the biggest players to the top." />
              <SortTh label="Entry" k="edge" sort={sort} set={setSort} hint="Their volume-weighted entry price on their side, and how that mark is doing now (e.g. +9pt = up 9 points since they bought). Sorts by who is most in profit on this market." />
              <SortTh label="Book" k="value" sort={sort} set={setSort} hint="The wallet's total open position value across ALL of Polymarket. A signal of how big a player they are; a $1M book betting here is conviction." />
              <SortTh label="Win" k="win" sort={sort} set={setSort} hint="Approximate recent win rate (wins/bets) from settled markets. Wins counted from on-chain redeems, losses from positions held to zero. A lower bound, not a lifetime record." />
            </div>
            <ul>
              {sorted.map((t) => (
                <TraderRow
                  key={t.wallet}
                  t={t}
                  sharp={isSharp(t)}
                  now={now}
                  expanded={open === t.wallet}
                  onToggle={() => setOpen(open === t.wallet ? null : t.wallet)}
                  onJump={onJump}
                  loadable={loadable}
                />
              ))}
            </ul>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              Win rate is a recent-form approximation: wins from on-chain redeems, losses from
              positions held to zero. A lower bound, not a lifetime record. Click a wallet to see its
              whole book.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Flow gauge ───────────────────────────────────────────────────────────────
function FlowGauge({ data }: { data: MarketSmartMoney }) {
  const total = data.flow.totalUsd || 1;
  const tilt = Math.max(-1, Math.min(1, data.flow.netUsd / total));
  const yesPortion = (1 + tilt) / 2;
  const yes = data.outcomes[0] ?? "Yes";
  const no = data.outcomes[1] ?? "No";
  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-faint">Net flow</div>
          <div className="font-mono text-lg leading-tight">
            <span className={data.flow.netUsd >= 0 ? "text-pos" : "text-neg"}>
              {fmtUsd(Math.abs(data.flow.netUsd))} → {data.flow.netSide}
            </span>
          </div>
        </div>
        <div className="text-right font-mono text-[11px] text-faint">
          {data.curYesKnown && (
            <div>
              {yes} <span className="text-foreground">{data.curYes.toFixed(2)}</span>
            </div>
          )}
          <div>top wallet {pct(data.flow.topShare)}</div>
        </div>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-elevated">
        <div className="bg-pos/70" style={{ width: `${yesPortion * 100}%` }} />
        <div className="bg-neg/70" style={{ width: `${(1 - yesPortion) * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
        <span className="text-pos/80">{yes} {fmtUsd(total * yesPortion)}</span>
        {data.flow.biggest && (
          <span title="biggest single print">
            biggest {fmtUsd(data.flow.biggest.usd)} {data.flow.biggest.outcome} @{" "}
            {data.flow.biggest.price.toFixed(2)}
          </span>
        )}
        <span className="text-neg/80">{no} {fmtUsd(total * (1 - yesPortion))}</span>
      </div>
    </div>
  );
}

// ── Trader row + drill-down ──────────────────────────────────────────────────
function TraderRow({
  t,
  sharp,
  now,
  expanded,
  onToggle,
  onJump,
  loadable,
}: {
  t: SharpTrader;
  sharp: boolean;
  now: number;
  expanded: boolean;
  onToggle: () => void;
  onJump?: (cid: string) => void;
  loadable?: Set<string>;
}) {
  const yes = t.sideIndex === 0;
  return (
    <li className={sharp ? "rounded-md bg-accent/[0.04]" : ""}>
      <button
        onClick={onToggle}
        className="grid w-full grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-4 border-b border-hairline/60 px-1 py-2 text-left font-mono text-xs hover:bg-elevated/40"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`shrink-0 text-[9px] text-faint transition-transform ${expanded ? "rotate-90" : ""}`}>▸</span>
          {sharp && (
            <span className="shrink-0 rounded bg-accent/15 px-1 text-[9px] uppercase tracking-wide text-accent">sharp</span>
          )}
          <span className="truncate text-foreground" title={t.wallet}>{t.name}</span>
          <span className="shrink-0 text-[10px] text-faint">{ago(t.lastTs, now)}</span>
        </span>
        <span className="text-right">
          <span className={yes ? "text-pos" : "text-neg"}>{t.side}</span>{" "}
          <span className="text-foreground">{fmtUsd(t.marketUsd)}</span>
        </span>
        <span className="text-right">
          <span className="text-foreground">{t.avgEntry > 0 ? t.avgEntry.toFixed(2) : "-"}</span>
          {t.unrealized != null && (
            <span className={t.unrealized >= 0 ? "text-pos" : "text-neg"}> {pts(t.unrealized)}</span>
          )}
        </span>
        <span className="text-right text-muted">{t.value >= 1 ? fmtUsd(t.value) : "-"}</span>
        <span className="text-right">
          {t.recordKnown ? (
            <span className={sharp ? "text-accent" : t.winRate >= 0.5 ? "text-foreground" : "text-muted"}>
              {pct(t.winRate)} <span className="text-faint">({t.wins}/{t.bets})</span>
            </span>
          ) : (
            <span className="text-faint">-</span>
          )}
        </span>
      </button>
      {expanded && <WalletDrawer wallet={t.wallet} name={t.name} onJump={onJump} loadable={loadable} />}
    </li>
  );
}

function WalletDrawer({
  wallet,
  name,
  onJump,
  loadable,
}: {
  wallet: string;
  name: string;
  onJump?: (cid: string) => void;
  loadable?: Set<string>;
}) {
  useTrackedWallets(); // re-render on follow toggle
  const followed = isTracked(wallet);
  const [book, setBook] = useState<WalletBook | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`/api/pm-smart/wallet?addr=${encodeURIComponent(wallet)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: WalletBook) => {
        if (!alive) return;
        setBook(d);
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [wallet]);

  return (
    <div className="border-b border-hairline/60 bg-elevated/30 px-3 py-2.5">
      {state === "loading" && <div className="text-[11px] text-faint">Loading book…</div>}
      {state === "error" && <div className="text-[11px] text-neg">Couldn&apos;t load this wallet.</div>}
      {state === "ok" && book && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
            <span className="text-faint">book <span className="text-foreground">{fmtUsd(book.value)}</span></span>
            <span className="text-faint">
              open PnL{" "}
              <span className={book.openPnl >= 0 ? "text-pos" : "text-neg"}>
                {book.openPnl >= 0 ? "+" : ""}{fmtUsd(book.openPnl)} {book.openPnl >= 0 ? "+" : ""}{Math.round(book.openPnlPct * 100)}%
              </span>
            </span>
            <span className="text-faint">
              win{" "}
              {book.recordKnown ? (
                <span className="text-foreground">{pct(book.winRate)} ({book.wins}/{book.bets})</span>
              ) : (
                <span>-</span>
              )}
            </span>
            <button
              onClick={() => toggleTracked(wallet, name)}
              className={`ml-auto rounded px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors ${
                followed ? "bg-accent/15 text-accent" : "border border-border text-faint hover:text-foreground"
              }`}
            >
              {followed ? "Following" : "Follow"}
            </button>
          </div>
          {book.holdings.length === 0 ? (
            <div className="text-[11px] text-faint">No open positions.</div>
          ) : (
            <ul className="space-y-0.5">
              {book.holdings.slice(0, 12).map((h) => {
                const jumpable = onJump && loadable?.has(h.conditionId);
                return (
                  <li
                    key={h.conditionId + h.outcome}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 font-mono text-[11px]"
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      {jumpable ? (
                        <button
                          onClick={() => onJump!(h.conditionId)}
                          className="truncate text-left text-foreground hover:text-accent hover:underline"
                          title={h.title}
                        >
                          {h.title}
                        </button>
                      ) : (
                        <span className="truncate text-foreground/80" title={h.title}>{h.title}</span>
                      )}
                    </span>
                    <span className="text-right text-muted">
                      {h.outcome} @ {h.avgPrice.toFixed(2)}→{h.curPrice.toFixed(2)}
                    </span>
                    <span className="w-16 text-right">
                      <span className="text-foreground">{fmtUsd(h.value)}</span>{" "}
                      <span className={h.pnl >= 0 ? "text-pos" : "text-neg"}>
                        {h.pnl >= 0 ? "+" : ""}
                        {Math.round(h.pnlPct)}%
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── bits ─────────────────────────────────────────────────────────────────────
function SortTh({
  label,
  k,
  sort,
  set,
  hint,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  set: (k: SortKey) => void;
  hint?: string;
}) {
  return (
    <span className="flex items-center justify-end gap-1">
      <button
        onClick={() => set(k)}
        className={`uppercase tracking-wide ${sort === k ? "text-accent" : "hover:text-foreground"}`}
      >
        {label}
        {sort === k ? " ↓" : ""}
      </button>
      {hint && <Hint text={hint} />}
    </span>
  );
}

function Stepper({
  value,
  onChange,
  suffix,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  step?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-elevated px-1 py-0.5">
      <button onClick={() => onChange(value - step)} className="px-1 text-faint hover:text-foreground">−</button>
      <span className="min-w-[1.5rem] text-center text-foreground">{value}</span>
      <button onClick={() => onChange(value + step)} className="px-1 text-faint hover:text-foreground">+</button>
      <span className="text-faint">{suffix}</span>
    </span>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-12 rounded-lg bg-elevated/60" />
      <div className="h-14 rounded-xl bg-elevated/60" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-5 rounded bg-elevated/40" />
        ))}
      </div>
    </div>
  );
}

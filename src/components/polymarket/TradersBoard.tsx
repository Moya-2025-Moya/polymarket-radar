"use client";

import { useEffect, useState } from "react";
import type { ProvenWallet, MotherCluster, WalletBook } from "@/lib/pm-smart";
import { nowMs } from "@/lib/polymarket-exec";
import { Hint } from "@/components/ui/Hint";
import { useTrackedWallets, isTracked, toggleTracked } from "@/lib/pm-tracked-wallets";
import { useWalletFilters, setWalletFilters } from "@/lib/pm-wallet-filters";

const fmtUsd = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}M` : a >= 1_000 ? `${(a / 1_000).toFixed(1)}k` : `${a.toFixed(0)}`;
  return `${n < 0 ? "-" : ""}$${s}`;
};
const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmtUsd(n)}`;
const cents = (p: number) => `${Math.round(p * 100)}¢`;
const ago = (ts: number, now: number) => {
  const s = Math.max(0, now - ts);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const updatedAgo = (gen: number, now: number) => {
  const s = Math.max(0, now - gen / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const priceBand = (lo: number, hi: number) =>
  lo > 0 && hi > 0 ? (Math.abs(hi - lo) < 0.01 ? cents(lo) : `${cents(lo)}-${cents(hi)}`) : "-";

type Mode = "proven" | "mother";

export function TradersBoard() {
  const [mode, setMode] = useState<Mode>("proven");
  const tracked = useTrackedWallets();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <p className="max-w-2xl text-sm leading-relaxed text-muted">
        <span className="text-foreground">Wallets worth copying.</span> Find traders who are actually
        making money and the hidden insiders running packs of fresh wallets, then Follow them - their
        next trade shows up on your Overview as a copy signal.
      </p>

      {tracked.length > 0 && <TrackedSection />}

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
            <button
              onClick={() => setMode("proven")}
              className={`rounded-md px-3 py-1.5 ${mode === "proven" ? "bg-elevated text-accent" : "text-muted hover:text-foreground"}`}
            >
              Proven wallets
            </button>
            <button
              onClick={() => setMode("mother")}
              className={`rounded-md px-3 py-1.5 ${mode === "mother" ? "bg-elevated text-accent" : "text-muted hover:text-foreground"}`}
            >
              母鸡 clusters
            </button>
          </div>
          <Hint
            text={
              mode === "proven"
                ? "Established wallets (long track record) ranked by how much they're up right now. Tune the win-rate and bet-count bar to find the ones with a real edge."
                : "Brand-new wallets loading longshots that share one on-chain funder (the 母鸡). The whole cluster is one hidden operator, so its combined record is what matters."
            }
          />
        </div>

        {mode === "proven" ? <ProvenView /> : <MotherView />}
      </section>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function Stepper({ value, onChange, suffix, step = 1, min = 0, max = 999 }: { value: number; onChange: (v: number) => void; suffix: string; step?: number; min?: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-elevated px-1.5 py-1 text-xs">
      <span className="text-faint">{suffix}</span>
      <button onClick={() => onChange(Math.max(min, value - step))} className="px-1 text-faint hover:text-foreground">−</button>
      <span className="min-w-[2rem] text-center font-mono text-foreground">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} className="px-1 text-faint hover:text-foreground">+</button>
    </span>
  );
}

// True lifetime P&L from Polymarket's user-pnl API. OFF until QA adds the
// /user-pnl passthrough — flip HISTORY_ENABLED then (no other change). Keeping it
// off avoids firing a fetch per card that can only return null today.
const HISTORY_ENABLED = false;

function HistPnl({ wallet }: { wallet: string }) {
  const [pnl, setPnl] = useState<{ total: number; week: number } | null>(null);
  useEffect(() => {
    if (!HISTORY_ENABLED) return;
    let alive = true;
    fetch(`/api/pm-smart/history?addr=${encodeURIComponent(wallet)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pnl: { total: number; week: number } | null } | null) => {
        if (alive && d?.pnl) setPnl(d.pnl);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [wallet]);
  if (!pnl) return null;
  return (
    <span title="lifetime realized + unrealized P&L (Polymarket)">
      lifetime <span className={`font-mono font-medium ${pnl.total >= 0 ? "text-pos" : "text-neg"}`}>{signed(pnl.total)}</span>
      {pnl.week !== 0 && (
        <span className={pnl.week >= 0 ? "text-pos" : "text-neg"}> · 7d {pnl.week >= 0 ? "+" : ""}{fmtUsd(pnl.week)}</span>
      )}
    </span>
  );
}

function FollowBtn({ wallet, label, small }: { wallet: string; label: string; small?: boolean }) {
  useTrackedWallets();
  const on = isTracked(wallet);
  return (
    <button
      onClick={() => toggleTracked(wallet, label)}
      className={`shrink-0 rounded uppercase tracking-wide transition-colors ${small ? "px-1.5 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"} ${
        on ? "bg-accent/15 text-accent" : "border border-border text-faint hover:text-foreground"
      }`}
    >
      {on ? (small ? "✓" : "Following") : "Follow"}
    </button>
  );
}

function UpdatedNote({ gen, now }: { gen: number; now: number }) {
  if (!gen) return null;
  return <span className="text-[11px] text-faint">snapshot · updated {updatedAgo(gen, now)}</span>;
}

function Skeleton({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-[88px] animate-pulse rounded-xl bg-elevated/40" />
      ))}
    </div>
  );
}

// ── Proven wallets ───────────────────────────────────────────────────────────
function ProvenView() {
  const f = useWalletFilters();
  const [rows, setRows] = useState<ProvenWallet[] | null>(null);
  const [gen, setGen] = useState(0);
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("loading");
    fetch(`/api/pm-smart/proven?minVol=${f.scanMinVolume}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { traders: ProvenWallet[]; generatedAt: number }) => {
        if (!alive) return;
        setRows(d.traders);
        setGen(d.generatedAt);
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [f.scanMinVolume]);

  const now = Math.floor(nowMs() / 1000);
  const shown = (rows ?? []).filter((w) => w.bets >= f.provenMinBets && w.winRate >= f.provenMinWin);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Stepper value={f.provenMinBets} suffix="≥ bets" step={5} onChange={(v) => setWalletFilters({ provenMinBets: v })} />
        <Stepper value={Math.round(f.provenMinWin * 100)} suffix="≥ win%" step={5} max={100} onChange={(v) => setWalletFilters({ provenMinWin: v / 100 })} />
        <Stepper value={f.scanMinVolume} suffix="≥ $k vol" step={5} onChange={(v) => setWalletFilters({ scanMinVolume: v })} />
        <span className="ml-auto"><UpdatedNote gen={gen} now={now} /></span>
      </div>
      {state === "loading" && <Skeleton />}
      {state === "error" && <div className="text-sm text-neg">Couldn&apos;t load wallets.</div>}
      {state === "ok" && shown.length === 0 && (
        <div className="rounded-xl border border-hairline bg-surface px-5 py-8 text-center text-sm text-muted">
          No wallet clears {f.provenMinBets} bets at {Math.round(f.provenMinWin * 100)}% win. Lower the bar above.
        </div>
      )}
      {state === "ok" && shown.length > 0 && (
        <ul className="space-y-2.5">
          {shown.map((w) => (
            <li key={w.wallet} className="rounded-xl border border-hairline bg-surface px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground" title={w.wallet}>{w.name}</span>
                  <span className="text-[11px] text-faint">{fmtUsd(w.value)} portfolio</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className={`font-mono text-lg font-semibold ${w.openPnl >= 0 ? "text-pos" : "text-neg"}`}>
                    {signed(w.openPnl)}
                  </span>
                  <FollowBtn wallet={w.wallet} label={w.name} />
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <HistPnl wallet={w.wallet} />
                <span><span className="font-mono font-medium text-foreground">{Math.round(w.winRate * 100)}%</span> win <span className="text-faint">({w.wins}/{w.bets})</span></span>
                <span><span className="font-mono text-foreground">{w.weekBets}</span> bets this week</span>
                <span>bets <span className="font-mono text-foreground">{priceBand(w.priceLo, w.priceHi)}</span></span>
                <span className="text-faint">open {w.openPnl >= 0 ? "+" : ""}{Math.round(w.openPnlPct * 100)}%</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 母鸡 clusters ────────────────────────────────────────────────────────────
function MotherView() {
  const f = useWalletFilters();
  const [rows, setRows] = useState<MotherCluster[] | null>(null);
  const [gen, setGen] = useState(0);
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("loading");
    fetch(`/api/pm-smart/mothers?minVol=${f.scanMinVolume}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { clusters: MotherCluster[]; generatedAt: number }) => {
        if (!alive) return;
        setRows(d.clusters);
        setGen(d.generatedAt);
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [f.scanMinVolume]);

  const now = Math.floor(nowMs() / 1000);
  const shown = (rows ?? []).filter((c) => c.count >= f.motherMinWallets);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Stepper value={f.motherMinWallets} suffix="≥ wallets" min={2} onChange={(v) => setWalletFilters({ motherMinWallets: v })} />
        <Stepper value={f.scanMinVolume} suffix="≥ $k vol" step={5} onChange={(v) => setWalletFilters({ scanMinVolume: v })} />
        <span className="ml-auto"><UpdatedNote gen={gen} now={now} /></span>
      </div>
      {state === "loading" && <Skeleton n={3} />}
      {state === "error" && <div className="text-sm text-neg">Couldn&apos;t load clusters.</div>}
      {state === "ok" && shown.length === 0 && (
        <div className="rounded-xl border border-hairline bg-surface px-5 py-8 text-center text-sm leading-relaxed text-muted">
          No 母鸡 detected - no group of fresh longshot wallets currently shares an on-chain funder.
        </div>
      )}
      {state === "ok" && shown.length > 0 && (
        <ul className="space-y-2.5">
          {shown.map((c) => (
            <li key={c.funder} className="rounded-xl border border-accent/30 bg-accent/[0.04] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">母鸡</span>
                    <a
                      href={`https://polygonscan.com/address/${c.funder}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-foreground hover:text-accent hover:underline"
                    >
                      {c.funder.slice(0, 6)}…{c.funder.slice(-4)}
                    </a>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-faint">
                    funds {c.count} fresh wallets · {fmtUsd(c.totalValue)} combined portfolio
                  </span>
                </span>
                <span className={`shrink-0 font-mono text-lg font-semibold ${c.totalOpenPnl >= 0 ? "text-pos" : "text-neg"}`}>
                  {signed(c.totalOpenPnl)}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span><span className="font-mono font-medium text-foreground">{Math.round(c.winRate * 100)}%</span> win <span className="text-faint">({c.totalWins}/{c.totalBets})</span></span>
                <span><span className="font-mono text-foreground">{c.weekBets}</span> bets this week</span>
                <span>betting <span className="font-mono text-foreground">{priceBand(c.priceLo, c.priceHi)}</span></span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-hairline/60 pt-2.5">
                {c.members.map((m) => (
                  <span key={m.wallet} className="flex items-center gap-1 rounded bg-elevated px-1.5 py-0.5 text-[11px]">
                    <span className="text-foreground" title={m.wallet}>{m.name}</span>
                    <FollowBtn wallet={m.wallet} label={m.name} small />
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── tracked wallets (kept compact) ──────────────────────────────────────────
function TrackedSection() {
  const tracked = useTrackedWallets();
  const [books, setBooks] = useState<Record<string, WalletBook>>({});
  const now = Math.floor(nowMs() / 1000);

  useEffect(() => {
    let alive = true;
    tracked.forEach((w) => {
      fetch(`/api/pm-smart/wallet?addr=${encodeURIComponent(w.address)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: WalletBook | null) => {
          if (alive && d) setBooks((prev) => ({ ...prev, [w.address.toLowerCase()]: d }));
        })
        .catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [tracked]);

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-muted">Following</h2>
        <Hint text="Wallets you track. Their open profit and latest trade - a new trade from a sharp wallet is your copy signal." />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {tracked.map((w) => {
          const b = books[w.address.toLowerCase()];
          const last = b?.recentTrades?.[0];
          const fresh = last && w.seenTradeTs > 0 && last.ts > w.seenTradeTs;
          return (
            <div key={w.address} className="rounded-xl border border-hairline bg-surface px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  {fresh && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                  <span className="truncate font-medium text-foreground">{w.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {b && <span className={`font-mono text-sm ${b.openPnl >= 0 ? "text-pos" : "text-neg"}`}>{signed(b.openPnl)}</span>}
                  <FollowBtn wallet={w.address} label={w.label} small />
                </span>
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-muted">
                {last ? `${last.side === "BUY" ? "bought" : "sold"} ${last.outcome} @ ${cents(last.price)} · ${ago(last.ts, now)}` : b ? "no recent trades" : "loading…"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

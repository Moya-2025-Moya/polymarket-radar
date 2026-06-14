"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UnderdogSignal } from "@/lib/pm-smart";
import type { FundingTrace } from "@/lib/pm-funding";
import { nowMs } from "@/lib/polymarket-exec";
import { Hint } from "@/components/ui/Hint";
import { endLabel } from "@/lib/market-time";
import { useTrackedWallets, isTracked, toggleTracked } from "@/lib/pm-tracked-wallets";
import { useWalletFilters, setWalletFilters } from "@/lib/pm-wallet-filters";

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const fmtUsd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}k` : `$${n.toFixed(0)}`;
const cents = (p: number) => (p > 0 ? `${Math.round(p * 100)}¢` : "?");
const ago = (ts: number, now: number) => {
  const s = Math.max(0, now - ts);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

type Titles = Record<string, { question: string; end_date_iso?: string | null }>;

export function UnderdogBoard() {
  const f = useWalletFilters();
  const router = useRouter();
  const [freshOnly, setFreshOnly] = useState(true);
  const [rows, setRows] = useState<UnderdogSignal[] | null>(null);
  const [titles, setTitles] = useState<Titles>({});
  const [gen, setGen] = useState(0);
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("loading");
    fetch(`/api/pm-smart/underdog?minVol=${f.scanMinVolume}&fresh=${freshOnly ? "1" : "0"}`)
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || r.status))))
      .then((d: { signals: UnderdogSignal[]; titles: Titles; generatedAt: number }) => {
        if (!alive) return;
        setRows(d.signals);
        setTitles(d.titles ?? {});
        setGen(d.generatedAt ?? 0);
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
  }, [f.scanMinVolume, freshOnly]);

  const now = Math.floor(nowMs() / 1000);
  const titleOf = (cid: string) => titles[cid]?.question ?? cid.slice(0, 16);
  const endOf = (cid: string) => titles[cid]?.end_date_iso;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          <span className="text-foreground">Big money betting on longshots.</span> Each market below
          has large bets on its <span className="text-neg">cheap side</span> (≤35¢) - the outcome the
          crowd thinks won&apos;t happen. When several brand-new wallets pile onto the same longshot at
          once, it can be an insider spreading bets across throwaway wallets. Huge payoff if right, but
          usually wrong: a lead to dig into, not a buy button.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            <button
              onClick={() => setFreshOnly(true)}
              className={`rounded-md px-3 py-1 ${freshOnly ? "bg-elevated text-accent" : "text-muted hover:text-foreground"}`}
            >
              New-wallet clusters
            </button>
            <button
              onClick={() => setFreshOnly(false)}
              className={`rounded-md px-3 py-1 ${!freshOnly ? "bg-elevated text-accent" : "text-muted hover:text-foreground"}`}
            >
              All longshot bets
            </button>
          </div>
          <Hint text="New-wallet clusters: only markets where at least one brand-new (likely throwaway) wallet is loading the cheap side - the hidden-insider pattern. All longshot bets: every market with big money on the weak side, new wallets or not." />
          <span className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-elevated px-1.5 py-1 text-xs" title="Skip markets below this 24h volume when scanning">
              <span className="text-faint">≥ $k vol</span>
              <button onClick={() => setWalletFilters({ scanMinVolume: Math.max(0, f.scanMinVolume - 5) })} className="px-1 text-faint hover:text-foreground">−</button>
              <span className="min-w-[2rem] text-center font-mono text-foreground">{f.scanMinVolume}</span>
              <button onClick={() => setWalletFilters({ scanMinVolume: f.scanMinVolume + 5 })} className="px-1 text-faint hover:text-foreground">+</button>
            </span>
            {gen > 0 && <span className="text-[11px] text-faint">updated {ago(gen / 1000, now)}</span>}
          </span>
        </div>
      </div>

      {state === "loading" && (
        <div className="space-y-2.5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-elevated/40" />
          ))}
        </div>
      )}
      {state === "error" && <div className="text-sm text-neg">Scan failed. {err}</div>}
      {state === "ok" && rows && rows.length === 0 && (
        <div className="rounded-xl border border-hairline bg-surface px-6 py-10 text-center text-sm text-muted">
          {freshOnly
            ? "No fresh-wallet clusters on the cheap side right now. Try All underdog flow."
            : "No notable underdog loading right now."}
        </div>
      )}

      {state === "ok" && rows && rows.length > 0 && (
        <ul className="space-y-2.5">
          {rows.map((s) => {
            const expanded = open === s.cid;
            return (
              <li key={s.cid} className="overflow-hidden rounded-xl border border-hairline bg-surface">
                <button
                  onClick={() => setOpen(expanded ? null : s.cid)}
                  className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-elevated/40"
                >
                  <span className={`mt-1 shrink-0 text-xs text-faint transition-transform ${expanded ? "rotate-90" : ""}`}>▸</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">
                        {titleOf(s.cid)}
                      </div>
                      {(() => {
                        const end = endLabel(endOf(s.cid), now * 1000);
                        return end ? (
                          <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${end.urgent ? "bg-neg/15 text-neg" : "bg-elevated text-muted"}`}>
                            {end.text}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {/* Plain-language line: $X betting <side> at <price> */}
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-mono text-lg font-semibold text-foreground">{fmtUsd(s.underdogUsd)}</span>
                      <span className="text-sm text-muted">betting</span>
                      <span className="rounded bg-neg/15 px-1.5 py-0.5 text-sm font-medium text-neg">{s.outcome}</span>
                      <span className="text-sm text-muted">at</span>
                      <span className="font-mono text-sm font-medium text-foreground">{cents(s.curPrice)}</span>
                      <span className="text-xs text-faint">(crowd gives it ~{Math.round(s.curPrice * 100)}%)</span>
                    </div>
                    {/* Who and when */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{s.buyers} {s.buyers > 1 ? "wallets" : "wallet"}</span>
                      {s.freshBuyers > 0 && (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
                          {s.freshBuyers} brand-new
                        </span>
                      )}
                      <span className="text-faint">· last buy {ago(s.lastTs, now)}</span>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-hairline bg-bg/30 px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs font-medium text-foreground">Who&apos;s buying the {s.outcome} longshot</div>
                      <button
                        onClick={() => router.push(`/polymarket?m=${s.cid}`)}
                        className="rounded border border-border px-2 py-1 text-[11px] text-muted hover:text-accent"
                      >
                        open market in terminal →
                      </button>
                    </div>
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_7rem_5rem_4.5rem_4.5rem] items-center gap-x-3 border-b border-hairline pb-1.5 text-[10px] uppercase tracking-wide text-faint">
                      <span>Wallet</span>
                      <span>History</span>
                      <span className="text-right">Bet size</span>
                      <span className="text-right">Bought at</span>
                      <span className="text-right">Follow</span>
                    </div>
                    <ul className="divide-y divide-hairline/60">
                      {s.topBuyers.map((b) => (
                        <li key={b.wallet} className="grid grid-cols-[1fr_7rem_5rem_4.5rem_4.5rem] items-center gap-x-3 py-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {b.fresh && (
                              <span className="shrink-0 rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent" title={`Only ${b.activityCount} lifetime trades - likely a throwaway wallet`}>
                                new
                              </span>
                            )}
                            <span className="truncate font-medium text-foreground" title={b.wallet}>{b.name}</span>
                          </span>
                          <span className={`font-mono ${b.fresh ? "text-accent" : "text-muted"}`}>
                            {b.activityCount >= 200 ? "200+" : b.activityCount} trades
                            {b.wins > 0 && <span className="text-pos"> · {b.wins}W</span>}
                          </span>
                          <span className="text-right font-mono font-medium text-foreground">{fmtUsd(b.usd)}</span>
                          <span className="text-right font-mono text-muted">{cents(b.avgPrice)}</span>
                          <span className="flex justify-end">
                            <FollowBtn wallet={b.wallet} label={b.name} />
                          </span>
                        </li>
                      ))}
                    </ul>
                    <FundingTraceBlock
                      wallets={s.topBuyers.map((b) => b.wallet)}
                      names={Object.fromEntries(s.topBuyers.map((b) => [b.wallet.toLowerCase(), b.name]))}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Layer 2: on-demand on-chain funding trace. One click, RPC-frugal + cached 24h.
function FundingTraceBlock({ wallets, names }: { wallets: string[]; names: Record<string, string> }) {
  const [trace, setTrace] = useState<FundingTrace | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "ok">("idle");
  const nameOf = (a: string) => names[a.toLowerCase()] ?? shortAddr(a);

  const run = () => {
    setState("loading");
    fetch(`/api/pm-smart/funding?wallets=${encodeURIComponent(wallets.join(","))}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: FundingTrace) => {
        setTrace(d);
        setState("ok");
      })
      .catch(() => setState("error"));
  };

  if (state === "idle") {
    return (
      <button
        onClick={run}
        className="mt-3 rounded border border-border px-2.5 py-1 text-[11px] text-faint hover:text-foreground"
        title="Look up who funded these wallets on Polygon and cluster any that share a source. Cached, minimal RPC."
      >
        Trace funding (mother hen) →
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-hairline bg-bg/40 px-3 py-2.5">
      {state === "loading" && <div className="text-[11px] text-faint">Tracing on-chain funding…</div>}
      {state === "error" && <div className="text-[11px] text-neg">Trace failed.</div>}
      {state === "ok" && trace && !trace.rpcConfigured && (
        <div className="text-[11px] text-faint">Polygon RPC not configured.</div>
      )}
      {state === "ok" && trace && trace.rpcConfigured && (
        <div className="space-y-2">
          {trace.clusters.filter((c) => !c.isExchange).length > 0 ? (
            trace.clusters
              .filter((c) => !c.isExchange)
              .map((c) => (
                <div key={c.funder} className="rounded border border-accent/40 bg-accent/[0.06] px-2.5 py-2 text-[11px]">
                  <span className="text-accent">Mother hen found:</span>{" "}
                  <span className="font-mono text-foreground">{c.wallets.length} wallets</span> share funder{" "}
                  <a
                    href={`https://polygonscan.com/address/${c.funder}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-accent hover:underline"
                  >
                    {shortAddr(c.funder)}
                  </a>{" "}
                  <span className="text-faint">({c.funderTxCount} txs · likely one operator)</span>
                  <div className="mt-1 text-faint">{c.wallets.map((w) => nameOf(w)).join(", ")}</div>
                </div>
              ))
          ) : (
            <div className="text-[11px] text-faint">
              No shared on-chain funder among these. Each was funded separately
              {trace.clusters.some((c) => c.isExchange) ? " (some came straight from an exchange/bridge - trail ends there)." : "."}
            </div>
          )}
          <ul className="space-y-0.5">
            {trace.nodes.map((n) => (
              <li key={n.wallet} className="grid grid-cols-[1fr_auto] gap-x-2 font-mono text-[10px]">
                <span className="truncate text-foreground/70">{nameOf(n.wallet)}</span>
                <span className="text-faint">
                  {n.funder ? (
                    <>
                      ← <a href={`https://polygonscan.com/address/${n.funder}`} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{shortAddr(n.funder)}</a>
                    </>
                  ) : (
                    "no funding found"
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="text-[9px] text-faint">{trace.rpcCalls} RPC calls · cached 24h</div>
        </div>
      )}
    </div>
  );
}

function FollowBtn({ wallet, label }: { wallet: string; label: string }) {
  useTrackedWallets();
  const on = isTracked(wallet);
  return (
    <button
      onClick={() => toggleTracked(wallet, label)}
      className={`justify-self-end rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide transition-colors ${
        on ? "bg-accent/15 text-accent" : "border border-border text-faint hover:text-foreground"
      }`}
    >
      {on ? "✓" : "Follow"}
    </button>
  );
}

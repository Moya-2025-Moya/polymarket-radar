"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { InsiderMarket, MarketSmartMoney } from "@/lib/pm-smart";
import { nowMs } from "@/lib/polymarket-exec";
import { Hint } from "@/components/ui/Hint";
import { endLabel } from "@/lib/market-time";
import { useTrackedWallets, isTracked, toggleTracked } from "@/lib/pm-tracked-wallets";
import { useWalletFilters, setWalletFilters } from "@/lib/pm-wallet-filters";

const SORTS: { k: SortKey; label: string; hint: string }[] = [
  {
    k: "flow",
    label: "Most money",
    hint: "Net dollars pushing one way: buys of a side minus sells of it. The bigger and more one-directional, the stronger the conviction behind the move.",
  },
  {
    k: "sided",
    label: "Most lopsided",
    hint: "How one-directional the flow is. 100% means every traded dollar is on the same side; 50% is a balanced two-way market.",
  },
  {
    k: "wallets",
    label: "Fewest wallets",
    hint: "A big move from very few wallets is more suspicious than the same move spread across many. This sorts the most concentrated first.",
  },
];

const fmtUsd = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(1)}M` : a >= 1_000 ? `${(a / 1_000).toFixed(1)}k` : `${a.toFixed(0)}`;
  return `${n < 0 ? "-" : ""}$${s}`;
};
const cents = (p: number) => (p > 0 ? `${Math.round(p * 100)}¢` : "?");
const ago = (ts: number, now: number) => {
  const s = Math.max(0, now - ts);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

type SortKey = "flow" | "sided" | "wallets";

type Titles = Record<string, { question: string; end_date_iso?: string | null }>;

export function InsiderBoard() {
  const f = useWalletFilters();
  const [rows, setRows] = useState<InsiderMarket[] | null>(null);
  const [titles, setTitles] = useState<Titles>({});
  const [gen, setGen] = useState(0);
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<SortKey>("flow");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState("loading");
    fetch(`/api/pm-smart/insiders?minVol=${f.scanMinVolume}`)
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || r.status))))
      .then((d: { markets: InsiderMarket[]; titles: Titles; generatedAt: number }) => {
        if (!alive) return;
        setRows(d.markets);
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
  }, [f.scanMinVolume]);

  const now = Math.floor(nowMs() / 1000);
  const titleOf = (cid: string) => titles[cid]?.question ?? cid.slice(0, 16);
  const endOf = (cid: string) => titles[cid]?.end_date_iso;

  const sorted = useMemo(() => {
    const list = [...(rows ?? [])];
    if (sort === "sided") list.sort((a, b) => b.oneSided - a.oneSided);
    else if (sort === "wallets") list.sort((a, b) => a.wallets - b.wallets);
    else list.sort((a, b) => Math.abs(b.netUsd) - Math.abs(a.netUsd));
    return list;
  }, [rows, sort]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          <span className="text-foreground">Money piling onto one side.</span> Each market below has big,
          one-directional flow - the footprint of someone trading on conviction rather than two
          market-makers trading back and forth. Click a row to see who&apos;s behind it.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-faint">Sort by</span>
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            {SORTS.map(({ k, label }) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`rounded-md px-3 py-1 ${sort === k ? "bg-elevated text-accent" : "text-muted hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Hint text={SORTS.find((s) => s.k === sort)!.hint} />
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
      {state === "ok" && sorted.length === 0 && (
        <div className="rounded-xl border border-hairline bg-surface px-6 py-10 text-center text-sm text-muted">
          No concentrated flow right now. The tape looks two-sided across the board.
        </div>
      )}

      {state === "ok" && sorted.length > 0 && (
        <ul className="space-y-2.5">
          {sorted.map((m) => (
            <InsiderRow
              key={m.cid}
              m={m}
              title={titleOf(m.cid)}
              end={endLabel(endOf(m.cid), now * 1000)}
              now={now}
              expanded={open === m.cid}
              onToggle={() => setOpen(open === m.cid ? null : m.cid)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function InsiderRow({
  m,
  title,
  end,
  now,
  expanded,
  onToggle,
}: {
  m: InsiderMarket;
  title: string;
  end: { text: string; urgent: boolean; ended: boolean } | null;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const toYes = m.netUsd >= 0;
  const tilt = Math.max(0, Math.min(1, (1 + m.netUsd / (m.totalUsd || 1)) / 2));
  return (
    <li className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <button onClick={onToggle} className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-elevated/40">
        <span className={`mt-1 shrink-0 text-xs text-faint transition-transform ${expanded ? "rotate-90" : ""}`}>▸</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">{title}</div>
            {end && (
              <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${end.urgent ? "bg-neg/15 text-neg" : "bg-elevated text-muted"}`}>
                {end.text}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-lg font-semibold text-foreground">{fmtUsd(Math.abs(m.netUsd))}</span>
            <span className="text-sm text-muted">betting</span>
            <span className={`rounded px-1.5 py-0.5 text-sm font-medium ${toYes ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg"}`}>
              {m.side}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{Math.round(m.oneSided * 100)}% one-directional</span>
            <span className="text-faint">· {m.wallets} wallets</span>
            <span className="text-faint">· last trade {ago(m.lastTs, now)}</span>
          </div>
          {/* Yes/No tilt */}
          <div className="mt-2 flex h-1.5 max-w-xs overflow-hidden rounded-full bg-elevated">
            <div className="bg-pos/70" style={{ width: `${tilt * 100}%` }} />
            <div className="bg-neg/70" style={{ width: `${(1 - tilt) * 100}%` }} />
          </div>
          {m.biggest && (
            <div className="mt-2 truncate font-mono text-[11px] text-faint">
              biggest single bet {fmtUsd(m.biggest.usd)} on {m.biggest.outcome} @ {cents(m.biggest.price)} by {m.biggest.name}
            </div>
          )}
        </div>
      </button>
      {expanded && <InsiderDetail cid={m.cid} side={m.side} />}
    </li>
  );
}

function InsiderDetail({ cid, side }: { cid: string; side: string }) {
  const router = useRouter();
  useTrackedWallets();
  const [data, setData] = useState<MarketSmartMoney | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`/api/pm-smart/market?cid=${encodeURIComponent(cid)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: MarketSmartMoney) => {
        if (!alive) return;
        setData(d);
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [cid]);

  const onSide = (data?.traders ?? []).filter((t) => t.side === side).slice(0, 6);

  return (
    <div className="border-t border-hairline bg-bg/30 px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-medium text-foreground">Who&apos;s pushing {side}</div>
        <button
          onClick={() => router.push(`/polymarket?m=${cid}`)}
          className="rounded border border-border px-2 py-1 text-[11px] text-muted hover:text-accent"
        >
          open market in terminal →
        </button>
      </div>
      {state === "loading" && <div className="text-xs text-faint">Loading traders…</div>}
      {state === "error" && <div className="text-xs text-neg">Couldn&apos;t load traders.</div>}
      {state === "ok" &&
        (onSide.length === 0 ? (
          <div className="text-xs text-faint">No standout wallets on this side.</div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_4.5rem_3rem_3.5rem_5rem_4.5rem_3rem] items-center gap-x-2 border-b border-hairline pb-1.5 text-[10px] uppercase tracking-wide text-faint">
              <span>Wallet</span>
              <span className="text-right">Stake</span>
              <span className="text-right">Entry</span>
              <span className="text-right">Edge</span>
              <span className="text-right">Win</span>
              <span className="text-right">Book</span>
              <span></span>
            </div>
            <ul className="divide-y divide-hairline/60">
              {onSide.map((t) => {
                const conv = t.value > 0 ? t.marketUsd / t.value : 0;
                return (
                  <li key={t.wallet} className="grid grid-cols-[1fr_4.5rem_3rem_3.5rem_5rem_4.5rem_3rem] items-center gap-x-2 py-2 text-xs">
                    <a
                      href={`https://polymarket.com/profile/${t.wallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-medium text-foreground hover:text-accent hover:underline"
                      title={`${t.wallet} · opens Polymarket profile`}
                    >
                      {t.name}
                    </a>
                    <span className="text-right font-mono font-medium text-foreground" title={conv > 0 ? `${Math.round(conv * 100)}% of their book` : ""}>
                      {fmtUsd(t.marketUsd)}
                    </span>
                    <span className="text-right font-mono text-muted">{t.avgEntry > 0 ? cents(t.avgEntry) : "-"}</span>
                    <span className={`text-right font-mono ${t.unrealized == null ? "text-faint" : t.unrealized >= 0 ? "text-pos" : "text-neg"}`}>
                      {t.unrealized == null ? "-" : `${t.unrealized >= 0 ? "+" : ""}${Math.round(t.unrealized * 100)}pt`}
                    </span>
                    <span className="text-right font-mono text-muted">
                      {t.recordKnown ? (
                        <>
                          {Math.round(t.winRate * 100)}% <span className="text-faint">({t.wins}/{t.bets})</span>
                        </>
                      ) : (
                        "-"
                      )}
                    </span>
                    <span className="text-right font-mono text-muted" title="total portfolio value across Polymarket">
                      {t.value >= 1 ? fmtUsd(t.value) : "-"}
                    </span>
                    <span className="flex justify-end">
                      <FollowBtn wallet={t.wallet} label={t.name} />
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              Stake = $ they put on {side} here (hover for % of their book). Edge = how that entry is
              marked now. Book = their whole Polymarket portfolio.
            </p>
          </>
        ))}
    </div>
  );
}

function FollowBtn({ wallet, label }: { wallet: string; label: string }) {
  useTrackedWallets();
  const on = isTracked(wallet);
  return (
    <button
      onClick={() => toggleTracked(wallet, label)}
      className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide transition-colors ${
        on ? "bg-accent/15 text-accent" : "border border-border text-faint hover:text-foreground"
      }`}
    >
      {on ? "✓" : "Follow"}
    </button>
  );
}

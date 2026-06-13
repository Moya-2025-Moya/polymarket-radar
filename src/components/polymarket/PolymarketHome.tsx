"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { InsiderMarket, UnderdogSignal, WalletBook, Candidate } from "@/lib/pm-smart";
import { nowMs } from "@/lib/polymarket-exec";
import { endLabel } from "@/lib/market-time";
import { useTrackedWallets } from "@/lib/pm-tracked-wallets";
import { useWalletFilters } from "@/lib/pm-wallet-filters";

export interface Mover {
  cid: string;
  question: string;
  end_date_iso?: string | null;
  spike: number;
  chg: number;
  volume: number;
}

function EndChip({ iso, now }: { iso: string | null | undefined; now: number }) {
  const end = endLabel(iso, now);
  if (!end) return null;
  return (
    <span className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium ${end.urgent ? "bg-neg/15 text-neg" : "bg-elevated text-muted"}`}>
      {end.text}
    </span>
  );
}

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

export function PolymarketHome() {
  const f = useWalletFilters();
  const router = useRouter();
  const open = (cid: string) => router.push(`/polymarket?m=${cid}`);
  const [cands, setCands] = useState<Candidate[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/pm-smart/candidates?minVol=${f.scanMinVolume}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { candidates: Candidate[] } | null) => alive && d && setCands(d.candidates))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [f.scanMinVolume]);

  const titleOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cands) m.set(c.condition_id, c.question);
    return m;
  }, [cands]);
  const endOf = useMemo(() => {
    const m = new Map<string, string | null | undefined>();
    for (const c of cands) m.set(c.condition_id, c.end_date_iso);
    return m;
  }, [cands]);
  const movers: Mover[] = useMemo(
    () =>
      cands
        .filter((c) => c.volume >= 5000 && (c.spike >= 2.5 || Math.abs(c.chg) >= 0.12))
        .map((c) => ({ cid: c.condition_id, question: c.question, end_date_iso: c.end_date_iso, spike: c.spike, chg: c.chg, volume: c.volume }))
        .sort((a, b) => b.spike + Math.abs(b.chg) * 8 - (a.spike + Math.abs(a.chg) * 8))
        .slice(0, 6),
    [cands],
  );
  const now = Math.floor(nowMs() / 1000) * 1000; // ms for endLabel
  const minVol = f.scanMinVolume;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <TrackedDigest />
      <div className="grid gap-6 lg:grid-cols-2">
        <InsiderDigest minVol={minVol} titleOf={titleOf} endOf={endOf} now={now} onOpen={open} />
        <LongshotDigest minVol={minVol} titleOf={titleOf} endOf={endOf} now={now} onOpen={open} />
      </div>
      <MoversDigest movers={movers} now={now} onOpen={open} />
    </div>
  );
}

// ── section shell ────────────────────────────────────────────────────────────
function Section({
  title,
  hint,
  href,
  children,
}: {
  title: string;
  hint?: string;
  href?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-sm font-medium uppercase tracking-[0.12em] text-muted">{title}</h2>
        {href && (
          <button onClick={() => router.push(href)} className="text-[11px] text-faint hover:text-accent">
            see all →
          </button>
        )}
      </div>
      {hint && <p className="mb-2 text-xs leading-relaxed text-faint">{hint}</p>}
      {children}
    </section>
  );
}

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:border-border hover:bg-elevated/40"
    >
      {children}
    </button>
  );
}

function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-elevated/40" />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-hairline bg-surface px-4 py-5 text-sm text-muted">{text}</div>;
}

// ── tracked wallets (copy signals) ───────────────────────────────────────────
function TrackedDigest() {
  const tracked = useTrackedWallets();
  const router = useRouter();
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
    <Section
      title="Wallets you follow"
      hint="Anyone you track and what they just did. A new trade from a sharp wallet is your copy signal."
      href="/polymarket/traders"
    >
      {tracked.length === 0 ? (
        <Empty text="Not following anyone yet. Open Traders to find profitable wallets and Follow them." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {tracked.map((w) => {
            const b = books[w.address.toLowerCase()];
            const last = b?.recentTrades?.[0];
            const fresh = last && w.seenTradeTs > 0 && last.ts > w.seenTradeTs;
            return (
              <button
                key={w.address}
                onClick={() => router.push("/polymarket/traders")}
                className="rounded-lg border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:border-border hover:bg-elevated/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {fresh && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                    <span className="truncate text-sm font-medium text-foreground">{w.label}</span>
                  </span>
                  {b && (
                    <span className={`shrink-0 font-mono text-xs ${b.openPnl >= 0 ? "text-pos" : "text-neg"}`}>
                      {b.openPnl >= 0 ? "+" : ""}
                      {fmtUsd(b.openPnl)}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-muted">
                  {last
                    ? `${last.side === "BUY" ? "bought" : "sold"} ${last.outcome} @ ${cents(last.price)} · ${ago(last.ts, now)}`
                    : b
                      ? "no recent trades"
                      : "loading…"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── insider flow ─────────────────────────────────────────────────────────────
function InsiderDigest({
  minVol,
  titleOf,
  endOf,
  now,
  onOpen,
}: {
  minVol: number;
  titleOf: Map<string, string>;
  endOf: Map<string, string | null | undefined>;
  now: number;
  onOpen: (cid: string) => void;
}) {
  const [rows, setRows] = useState<InsiderMarket[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/pm-smart/insiders?minVol=${minVol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { markets: InsiderMarket[] } | null) => alive && d && setRows(d.markets))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [minVol]);

  return (
    <Section
      title="Insider flow"
      hint="Big money piling onto one side."
      href="/polymarket/insider"
    >
      {!rows ? (
        <Loading rows={3} />
      ) : rows.length === 0 ? (
        <Empty text="Tape looks two-sided right now." />
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 3).map((m) => (
            <Row key={m.cid} onClick={() => onOpen(m.cid)}>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {titleOf.get(m.cid) ?? m.cid.slice(0, 16)}
              </span>
              <EndChip iso={endOf.get(m.cid)} now={now} />
              <span className={`shrink-0 font-mono text-xs ${m.netUsd >= 0 ? "text-pos" : "text-neg"}`}>
                {fmtUsd(Math.abs(m.netUsd))} → {m.side}
              </span>
            </Row>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── longshot loading (母鸡) ──────────────────────────────────────────────────
function LongshotDigest({
  minVol,
  titleOf,
  endOf,
  now,
  onOpen,
}: {
  minVol: number;
  titleOf: Map<string, string>;
  endOf: Map<string, string | null | undefined>;
  now: number;
  onOpen: (cid: string) => void;
}) {
  const [rows, setRows] = useState<UnderdogSignal[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/pm-smart/underdog?minVol=${minVol}&fresh=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { signals: UnderdogSignal[] } | null) => alive && d && setRows(d.signals))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [minVol]);

  return (
    <Section
      title="Longshot loading (母鸡)"
      hint="New wallets betting big on cheap outcomes."
      href="/polymarket/underdog"
    >
      {!rows ? (
        <Loading rows={3} />
      ) : rows.length === 0 ? (
        <Empty text="No fresh-wallet clusters on longshots." />
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 3).map((s) => (
            <Row key={s.cid} onClick={() => onOpen(s.cid)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{titleOf.get(s.cid) ?? s.cid.slice(0, 16)}</span>
                <span className="font-mono text-[11px] text-muted">
                  {fmtUsd(s.underdogUsd)} on {s.outcome} @ {cents(s.curPrice)}
                </span>
              </span>
              <EndChip iso={endOf.get(s.cid)} now={now} />
              {s.freshBuyers > 0 && (
                <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  {s.freshBuyers} new
                </span>
              )}
            </Row>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── movers ───────────────────────────────────────────────────────────────────
function MoversDigest({ movers, now, onOpen }: { movers: Mover[]; now: number; onOpen: (cid: string) => void }) {
  return (
    <Section title="Moving now" hint="Markets with a sudden jump in volume or a big price swing this week.">
      {movers.length === 0 ? (
        <Empty text="Nothing unusual moving right now." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {movers.map((m) => (
            <Row key={m.cid} onClick={() => onOpen(m.cid)}>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{m.question}</span>
              <EndChip iso={m.end_date_iso} now={now} />
              <span className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
                {m.spike >= 2.5 && (
                  <span className="rounded bg-warn/15 px-1.5 py-0.5 text-warn">
                    {m.spike >= 10 ? "10×+" : `${m.spike.toFixed(1)}×`} vol
                  </span>
                )}
                {Math.abs(m.chg) >= 0.12 && (
                  <span className={m.chg >= 0 ? "text-pos" : "text-neg"}>
                    {m.chg >= 0 ? "+" : ""}
                    {Math.round(m.chg * 100)}pt
                  </span>
                )}
              </span>
            </Row>
          ))}
        </div>
      )}
    </Section>
  );
}

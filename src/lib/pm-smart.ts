// Smart-money read for a single market. Pulls the market's recent fills, ranks
// the wallets by dollar size, and approximates each wallet's track record so the
// client can highlight the sharp side and filter by win-rate / bet count.
//
// Win-rate is an APPROXIMATION the data can actually support: winners get auto-
// redeemed and vanish from /positions, but each win leaves a REDEEM in /activity;
// losers linger in /positions as worthless (curPrice 0) redeemable dust. So:
//   wins   = distinct markets with a REDEEM (from /activity)
//   losses = distinct markets held to 0 (from /positions)
//   bets   = wins + losses  (disjoint by market - a binary market is one or the
//            other, never both)
// Bounded by the recent activity/position window, so treat it as a recent-form
// lower bound, not a lifetime ledger.
import { unstable_cache } from "next/cache";
import {
  dataApiGet,
  proxyJson,
  polymarket,
  type PmTrade,
  type PmActivity,
  type PmRawPosition,
} from "./polymarket";
import { traceFunding } from "./pm-funding";

// True historical P&L from Polymarket's own user-pnl API (a cumulative $ time
// series). Needs the proxy to forward /user-pnl/* (a QA passthrough) - until then
// this throws and callers degrade to hiding it. No RPC; cached 1h.
export interface HistoricalPnl {
  total: number; // latest cumulative P&L (lifetime)
  week: number; // change over the last 7 days
  series: { t: number; p: number }[];
}

export async function historicalPnl(wallet: string): Promise<HistoricalPnl | null> {
  try {
    const series = await proxyJson<{ t: number; p: number }[]>(
      `/user-pnl/?user_address=${encodeURIComponent(wallet)}&interval=all&fidelity=1d`,
      3600,
    );
    if (!Array.isArray(series) || series.length === 0) return null;
    const total = series[series.length - 1].p;
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    const past = [...series].reverse().find((s) => s.t <= weekAgo);
    return { total, week: past ? total - past.p : 0, series };
  } catch {
    return null; // endpoint not wired yet → caller hides the row
  }
}

export interface Candidate {
  condition_id: string;
  question: string;
  end_date_iso?: string | null;
  volume: number;
  spike: number;
  chg: number;
}

const CANDIDATE_CAP = 200; // hard cap on markets a scan will sweep

// The full enriched market list, cached for an hour. The raw list is 2.4MB
// (uncacheable by Next's data cache) and its volume ranking churns every minute,
// which was busting every downstream cache and forcing a 2.4MB refetch on every
// page. unstable_cache stores the small slimmed result, computed once per hour.
const allCandidates = unstable_cache(
  async (): Promise<Candidate[]> => {
    const page = await polymarket.samplingMarkets();
    const tradeable = page.data.filter((m) => m.active && !m.closed && m.accepting_orders);
    const signals = await polymarket.marketSignals(tradeable.map((m) => m.condition_id));
    return tradeable
      .map((m) => {
        const s = signals[m.condition_id];
        return {
          condition_id: m.condition_id,
          question: m.question,
          end_date_iso: m.end_date_iso,
          volume: s?.volume ?? 0,
          spike: s?.spike ?? 0,
          chg: s?.chg ?? 0,
        };
      })
      .sort((a, b) => b.volume - a.volume);
  },
  ["pm-all-candidates"],
  { revalidate: 3600 },
);

// Markets above a user-set 24h-volume floor - the universe a scan sweeps. The
// floor (saved client-side, passed in) keeps dust out and bounds cost. Capped.
export async function candidatesAboveVolume(minVolume: number): Promise<Candidate[]> {
  const all = await allCandidates();
  return all.filter((c) => c.volume >= minVolume).slice(0, CANDIDATE_CAP);
}

const MARKET_TRADES = 500; // recent fills to scan for this market
const TOP_WALLETS = 16; // deepest pockets we bother scoring (2 calls each)
const RECORD_CONCURRENCY = 16;

export interface SharpTrader {
  wallet: string;
  name: string;
  side: string; // outcome label they're net long
  sideIndex: number;
  marketUsd: number; // total $ they traded in this market
  netUsd: number; // net $ into their side (buys − sells)
  avgEntry: number; // vol-weighted entry price on that side - their "habit"
  unrealized: number | null; // price pts vs entry at the current mark (+ = winning)
  trades: number; // fills in this market
  lastTs: number;
  bets: number; // resolved bets sampled (approx)
  wins: number;
  winRate: number; // 0..1
  recordKnown: boolean; // false when we couldn't sample any resolved bet
  value: number; // current portfolio value across Polymarket (book size)
}

export interface MarketSmartMoney {
  cid: string;
  outcomes: string[];
  curYes: number; // current price of outcome 0 (0..1), from the latest fill
  curYesKnown: boolean;
  flow: {
    buyUsd: number;
    sellUsd: number;
    totalUsd: number;
    netUsd: number; // signed toward outcome 0 (positive) vs outcome 1 (negative)
    netSide: string;
    traderCount: number;
    biggest: {
      usd: number;
      side: "BUY" | "SELL";
      outcome: string;
      price: number;
      name: string;
      ts: number;
    } | null;
    topShare: number; // biggest wallet's share of total $ - concentration
  };
  traders: SharpTrader[];
  sampledTrades: number;
}

/** One open holding in a wallet's book (for the drill-down). */
export interface WalletHolding {
  conditionId: string;
  tokenId: string;
  title: string;
  outcome: string;
  curPrice: number;
  avgPrice: number;
  value: number; // current USD value
  pnl: number; // unrealized cash PnL
  pnlPct: number;
}

/** A recent fill from a wallet's activity feed (the copy-trade signal). */
export interface WalletTrade {
  conditionId: string;
  title: string;
  side: "BUY" | "SELL";
  outcome: string;
  usd: number;
  price: number;
  ts: number;
}

export interface WalletBook {
  wallet: string;
  value: number; // total current book value
  openPnl: number; // unrealized PnL across open positions ($)
  openPnlPct: number; // unrealized PnL vs cost basis
  bets: number;
  wins: number;
  winRate: number;
  recordKnown: boolean;
  activityCount: number; // lifetime activity rows sampled (history length)
  weekBets: number; // trades in the last 7 days
  priceLo: number; // cheapest entry price they bet at (0..1)
  priceHi: number; // priciest entry
  holdings: WalletHolding[];
  recentTrades: WalletTrade[];
}

/** One wallet on the profit leaderboard (ranked by unrealized PnL). */
export interface LeaderboardEntry {
  wallet: string;
  name: string;
  value: number; // open book value
  openPnl: number; // unrealized PnL ($)
  openPnlPct: number;
  positions: number; // open position count
  markets: number; // how many scanned markets they showed up in
}

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

async function pool<T>(tasks: Array<() => Promise<T>>, n: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      out[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  return out;
}

// Open-book profit from positions alone (1 call) - value + unrealized PnL. The
// cleanest "is this wallet actually making money" signal, and cheap enough to
// run across a leaderboard's worth of wallets.
function profitFromPositions(positions: PmRawPosition[]): {
  value: number;
  openPnl: number;
  openPnlPct: number;
  open: number;
} {
  let value = 0;
  let openPnl = 0;
  let cost = 0;
  let open = 0;
  for (const p of positions) {
    value += p.currentValue ?? 0;
    if (p.curPrice > 0 && p.curPrice < 1) {
      open += 1;
      const pnl = p.cashPnl ?? 0;
      openPnl += pnl;
      cost += (p.currentValue ?? 0) - pnl; // value − pnl ≈ cost basis
    }
  }
  return { value, openPnl, openPnlPct: cost > 0 ? openPnl / cost : 0, open };
}

// Win/loss approximation: wins from on-chain redeems, losses from positions held
// to zero (a market is one or the other, never both). CRITICAL: both are bounded
// to the same recent window. Redeems only exist in the recent activity feed, but
// loss dust lingers in /positions forever - counting ALL of it would drag a
// profitable high-frequency wallet to a fake 0% win. So losses only count for
// markets the wallet also touched in the recent activity window.
function recordFromActivity(acts: PmActivity[], positions: PmRawPosition[]) {
  const recentMarkets = new Set<string>();
  for (const a of acts) recentMarkets.add(a.conditionId);
  const winMarkets = new Set<string>();
  for (const a of acts) {
    if (a.type === "REDEEM" && (a.usdcSize ?? 0) > 0) winMarkets.add(a.conditionId);
  }
  const lossMarkets = new Set<string>();
  for (const p of positions) {
    if (winMarkets.has(p.conditionId)) continue;
    if (!recentMarkets.has(p.conditionId)) continue; // keep wins/losses in the same window
    const resolved = p.redeemable === true || p.curPrice === 0 || p.curPrice === 1;
    if (resolved && (p.curPrice ?? 1) < 0.5) lossMarkets.add(p.conditionId);
  }
  const wins = winMarkets.size;
  const bets = wins + lossMarkets.size;
  return { bets, wins, known: bets > 0 };
}

// Lightweight: book value + win-rate, reusing one fetched position list. Used by
// the per-market panel (which only needs size + record, not the full book).
async function walletStats(
  wallet: string,
): Promise<{ bets: number; wins: number; known: boolean; value: number }> {
  try {
    const [acts, positions] = await Promise.all([
      dataApiGet<PmActivity[]>(`/activity?user=${wallet}&limit=500`, 300),
      dataApiGet<PmRawPosition[]>(`/positions?user=${wallet}&limit=500`, 300),
    ]);
    const rec = recordFromActivity(acts, positions);
    return { ...rec, value: profitFromPositions(positions).value };
  } catch {
    return { bets: 0, wins: 0, known: false, value: 0 };
  }
}

// Positions-only profit for the leaderboard (1 call/wallet).
async function walletProfitLight(
  wallet: string,
): Promise<{ value: number; openPnl: number; openPnlPct: number; open: number }> {
  try {
    const positions = await dataApiGet<PmRawPosition[]>(
      `/positions?user=${encodeURIComponent(wallet)}&limit=500`,
      300,
    );
    return profitFromPositions(positions);
  } catch {
    return { value: 0, openPnl: 0, openPnlPct: 0, open: 0 };
  }
}

// Full profile for the drill-down / wallet page: open book, unrealized PnL,
// recent fills (the copy signal), and approximate record.
export async function walletBook(wallet: string): Promise<WalletBook> {
  const [positions, acts] = await Promise.all([
    dataApiGet<PmRawPosition[]>(`/positions?user=${encodeURIComponent(wallet)}&limit=500`, 120),
    dataApiGet<PmActivity[]>(`/activity?user=${encodeURIComponent(wallet)}&limit=500`, 120),
  ]);
  const profit = profitFromPositions(positions);
  const rec = recordFromActivity(acts, positions);
  const holdings: WalletHolding[] = positions
    .filter((p) => p.curPrice > 0 && p.curPrice < 1 && (p.currentValue ?? 0) >= 1)
    .map((p) => ({
      conditionId: p.conditionId,
      tokenId: p.asset ?? "",
      title: p.title ?? p.conditionId.slice(0, 12),
      outcome: p.outcome ?? "",
      curPrice: p.curPrice,
      avgPrice: p.avgPrice ?? 0,
      value: p.currentValue ?? 0,
      pnl: p.cashPnl ?? 0,
      pnlPct: p.percentPnl ?? 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 40);
  const trades = acts.filter((a) => a.type === "TRADE");
  const recentTrades: WalletTrade[] = trades.slice(0, 12).map((a) => ({
    conditionId: a.conditionId,
    title: a.title ?? a.conditionId.slice(0, 12),
    side: a.side === "SELL" ? "SELL" : "BUY",
    outcome: a.outcome ?? "",
    usd: a.usdcSize ?? (a.size ?? 0) * (a.price ?? 0),
    price: a.price ?? 0,
    ts: a.timestamp,
  }));
  const weekCut = Math.floor(Date.now() / 1000) - 7 * 86400;
  const weekBets = trades.filter((a) => a.timestamp >= weekCut).length;
  // Price range they bet at: entry prices of open holdings + recent fills.
  const prices = [
    ...holdings.map((h) => h.avgPrice),
    ...trades.map((a) => a.price ?? 0),
  ].filter((p) => p > 0 && p < 1);
  const priceLo = prices.length ? Math.min(...prices) : 0;
  const priceHi = prices.length ? Math.max(...prices) : 0;
  return {
    wallet,
    value: profit.value,
    openPnl: profit.openPnl,
    openPnlPct: profit.openPnlPct,
    bets: rec.bets,
    wins: rec.wins,
    winRate: rec.bets ? rec.wins / rec.bets : 0,
    recordKnown: rec.known,
    activityCount: acts.length,
    weekBets,
    priceLo,
    priceHi,
    holdings,
    recentTrades,
  };
}

// Profit leaderboard: gather the active wallets across the busiest markets, then
// rank them by unrealized PnL - "who is actually making money", not just who is
// big or who wins often. Bounded fan-out (top markets × top wallets each).
const LB_MARKETS = 14;
const LB_WALLETS_PER_MARKET = 6;
const LB_MAX_WALLETS = 45;

export async function traderLeaderboard(cids: string[]): Promise<LeaderboardEntry[]> {
  const markets = [...new Set(cids)].slice(0, LB_MARKETS);
  // 1) collect candidate wallets from each market's tape
  const perMarket = await pool(
    markets.map((cid) => async () => {
      try {
        const trades = await dataApiGet<PmTrade[]>(
          `/trades?market=${encodeURIComponent(cid)}&limit=200`,
          120,
        );
        const byW = new Map<string, { name: string; usd: number }>();
        for (const t of trades) {
          const e = byW.get(t.proxyWallet) ?? { name: t.name || t.pseudonym || "", usd: 0 };
          e.usd += t.size * t.price;
          e.name = e.name || t.name || t.pseudonym || "";
          byW.set(t.proxyWallet, e);
        }
        return [...byW.entries()]
          .sort((a, b) => b[1].usd - a[1].usd)
          .slice(0, LB_WALLETS_PER_MARKET);
      } catch {
        return [] as [string, { name: string; usd: number }][];
      }
    }),
    20,  );

  // 2) dedupe wallets, tracking name + how many markets they appeared in
  const cand = new Map<string, { name: string; markets: number }>();
  for (const rows of perMarket) {
    for (const [w, info] of rows) {
      const e = cand.get(w) ?? { name: info.name, markets: 0 };
      e.markets += 1;
      e.name = e.name || info.name;
      cand.set(w, e);
    }
  }
  const wallets = [...cand.entries()].slice(0, LB_MAX_WALLETS);

  // 3) price each wallet's open book and rank by unrealized PnL
  const profits = await pool(
    wallets.map(([w]) => () => walletProfitLight(w)),
    RECORD_CONCURRENCY,
  );
  return wallets
    .map(([wallet, info], i) => ({
      wallet,
      name: info.name || short(wallet),
      value: profits[i].value,
      openPnl: profits[i].openPnl,
      openPnlPct: profits[i].openPnlPct,
      positions: profits[i].open,
      markets: info.markets,
    }))
    .filter((e) => e.value >= 50 || e.openPnl !== 0)
    .sort((a, b) => b.openPnl - a.openPnl)
    .slice(0, 30);
}

// ── Underdog scan ("母鸡" signal) ───────────────────────────────────────────
// Hunts the insider footprint: big BUYS on a CHEAP outcome (the side the market
// has written off), clustered across multiple low-history wallets. Insiders use
// fresh throwaway wallets to stay hidden, so a short trading history is a FEATURE
// here, not a disqualifier. Tape-only (no on-chain funding trace yet) - that's
// the second layer.
const UD_PRICE_CEIL = 0.35; // an outcome at/under this is the "weak side"
const UD_MIN_FILL = 250; // smallest single-wallet underdog stake worth listing
const UD_MIN_TOTAL = 1500; // market-level underdog total to surface
const UD_FRESH_MAX = 25; // ≤ this many lifetime activity rows ≈ a fresh wallet

export interface UnderdogBuyer {
  wallet: string;
  name: string;
  usd: number; // their buy $ on the cheap side
  avgPrice: number;
  fresh: boolean; // short/no trading history (insider-style throwaway)
  activityCount: number; // lifetime activity rows sampled
  wins: number; // redeemed (won) markets seen
}

export interface UnderdogSignal {
  cid: string;
  outcome: string; // the cheap side being loaded
  curPrice: number;
  underdogUsd: number; // total $ into the cheap side
  buyers: number; // distinct buyers on it
  freshBuyers: number; // how many are fresh wallets
  lastTs: number;
  topBuyers: UnderdogBuyer[];
  score: number;
}

const UD_SCAN_MARKETS = 150; // sweep every market above the volume floor
const UD_ENRICH_MARKETS = 24; // deep-enrich the top signals
const UD_BUYERS_PER_MARKET = 6;

export async function underdogScan(
  cids: string[],
  freshOnly = true,
): Promise<UnderdogSignal[]> {
  const markets = [...new Set(cids)].slice(0, UD_SCAN_MARKETS);

  // Pass 1 (tape): per market, aggregate BUY volume on each cheap outcome.
  type Cand = {
    cid: string;
    outcome: string;
    curPrice: number;
    underdogUsd: number;
    lastTs: number;
    buyers: { wallet: string; name: string; usd: number; sh: number }[];
  };
  const raw = await pool<Cand | null>(
    markets.map((cid) => async () => {
      try {
        const trades = await dataApiGet<PmTrade[]>(
          `/trades?market=${encodeURIComponent(cid)}&limit=300`,
          45,
        );
        if (!trades.length) return null;
        const cur: Record<number, number> = {};
        for (const t of trades) {
          const oi = t.outcomeIndex === 1 ? 1 : 0;
          if (cur[oi] === undefined && t.price > 0 && t.price < 1) cur[oi] = t.price;
        }
        // Per outcome: only count BUYS taken at a cheap price (the underdog).
        const perOi = new Map<
          number,
          { outcome: string; usd: number; lastTs: number; byW: Map<string, { name: string; usd: number; sh: number }> }
        >();
        for (const t of trades) {
          if (t.side !== "BUY" || !(t.price > 0 && t.price <= UD_PRICE_CEIL)) continue;
          const oi = t.outcomeIndex === 1 ? 1 : 0;
          const usd = t.size * t.price;
          const e = perOi.get(oi) ?? { outcome: t.outcome, usd: 0, lastTs: 0, byW: new Map() };
          e.usd += usd;
          e.lastTs = Math.max(e.lastTs, t.timestamp);
          const b = e.byW.get(t.proxyWallet) ?? { name: t.name || t.pseudonym || "", usd: 0, sh: 0 };
          b.usd += usd;
          b.sh += t.size;
          b.name = b.name || t.name || t.pseudonym || "";
          e.byW.set(t.proxyWallet, b);
          perOi.set(oi, e);
        }
        // The most-loaded cheap side.
        let best: { oi: number; outcome: string; usd: number; lastTs: number; byW: Map<string, { name: string; usd: number; sh: number }> } | null = null;
        for (const [oi, e] of perOi) {
          if (!best || e.usd > best.usd) best = { oi, ...e };
        }
        if (!best || best.usd < UD_MIN_TOTAL) return null;
        const buyers = [...best.byW.entries()]
          .map(([wallet, b]) => ({ wallet, name: b.name, usd: b.usd, sh: b.sh }))
          .filter((b) => b.usd >= UD_MIN_FILL)
          .sort((a, b) => b.usd - a.usd)
          .slice(0, UD_BUYERS_PER_MARKET);
        if (!buyers.length) return null;
        return {
          cid,
          outcome: best.outcome,
          curPrice: cur[best.oi] ?? 0,
          underdogUsd: best.usd,
          lastTs: best.lastTs,
          buyers,
        };
      } catch {
        return null;
      }
    }),
    20,  );

  const cands = raw
    .filter((c): c is Cand => c !== null)
    .sort((a, b) => b.underdogUsd - a.underdogUsd)
    .slice(0, UD_ENRICH_MARKETS);

  // Pass 2 (per buyer): how long has this wallet existed? Fresh = short history.
  const jobs: { ci: number; bi: number; wallet: string }[] = [];
  cands.forEach((c, ci) => c.buyers.forEach((b, bi) => jobs.push({ ci, bi, wallet: b.wallet })));
  const freshness = await pool(
    jobs.map((j) => async () => {
      try {
        const acts = await dataApiGet<PmActivity[]>(
          `/activity?user=${encodeURIComponent(j.wallet)}&limit=200`,
          180,
        );
        const wins = acts.filter((a) => a.type === "REDEEM" && (a.usdcSize ?? 0) > 0).length;
        return { count: acts.length, wins };
      } catch {
        return { count: 999, wins: 0 };
      }
    }),
    RECORD_CONCURRENCY,
  );

  const signals: UnderdogSignal[] = cands.map((c, ci) => {
    const topBuyers: UnderdogBuyer[] = c.buyers.map((b, bi) => {
      const f = freshness[jobs.findIndex((j) => j.ci === ci && j.bi === bi)] ?? { count: 999, wins: 0 };
      return {
        wallet: b.wallet,
        name: b.name || short(b.wallet),
        usd: b.usd,
        avgPrice: b.sh > 0 ? b.usd / b.sh : 0,
        fresh: f.count <= UD_FRESH_MAX,
        activityCount: f.count,
        wins: f.wins,
      };
    });
    const freshBuyers = topBuyers.filter((b) => b.fresh).length;
    const freshRatio = topBuyers.length ? freshBuyers / topBuyers.length : 0;
    return {
      cid: c.cid,
      outcome: c.outcome,
      curPrice: c.curPrice,
      underdogUsd: c.underdogUsd,
      buyers: c.buyers.length,
      freshBuyers,
      lastTs: c.lastTs,
      topBuyers,
      score: c.underdogUsd * (1 + freshRatio),
    };
  });

  return signals
    .filter((s) => (freshOnly ? s.freshBuyers >= 1 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

// ── Cross-market insider scan ──────────────────────────────────────────────
// Trades-only (no per-wallet lookups), so it stays cheap across many markets.
// Flags markets where whale money is piling in ONE direction - the footprint of
// someone trading on conviction/information rather than two-sided market-making.
const WHALE_MIN = 500; // a single fill this big counts as "whale"

export interface InsiderMarket {
  cid: string;
  totalUsd: number;
  netUsd: number; // signed toward outcome 0
  side: string; // dominant outcome label
  oneSided: number; // |net| / total - 1 = fully one-directional
  whaleUsd: number; // sum of fills ≥ WHALE_MIN
  wallets: number;
  biggest: { usd: number; outcome: string; price: number; side: "BUY" | "SELL"; name: string } | null;
  lastTs: number;
  score: number;
}

export async function insiderScan(cids: string[]): Promise<InsiderMarket[]> {
  const uniq = [...new Set(cids)].slice(0, CANDIDATE_CAP);
  const raw = await pool<InsiderMarket | null>(
    uniq.map((cid) => async () => {
      try {
        const trades = await dataApiGet<PmTrade[]>(
          `/trades?market=${encodeURIComponent(cid)}&limit=200`,
          45,
        );
        if (!trades.length) return null;
        let total = 0;
        let net = 0;
        let whale = 0;
        let lastTs = 0;
        const wset = new Set<string>();
        const outcomes: string[] = [];
        let biggest: InsiderMarket["biggest"] = null;
        for (const t of trades) {
          const usd = t.size * t.price;
          const oi = t.outcomeIndex === 1 ? 1 : 0;
          if (!outcomes[oi]) outcomes[oi] = t.outcome;
          total += usd;
          wset.add(t.proxyWallet);
          lastTs = Math.max(lastTs, t.timestamp);
          net += (oi === 0 ? 1 : -1) * (t.side === "BUY" ? 1 : -1) * usd;
          if (usd >= WHALE_MIN) whale += usd;
          if (!biggest || usd > biggest.usd) {
            biggest = { usd, outcome: t.outcome, price: t.price, side: t.side, name: t.name || t.pseudonym || short(t.proxyWallet) };
          }
        }
        const oneSided = total > 0 ? Math.abs(net) / total : 0;
        const side = net >= 0 ? outcomes[0] ?? "Yes" : outcomes[1] ?? "No";
        return {
          cid,
          totalUsd: total,
          netUsd: net,
          side,
          oneSided,
          whaleUsd: whale,
          wallets: wset.size,
          biggest,
          lastTs,
          score: Math.abs(net) * (0.5 + oneSided),
        };
      } catch {
        return null;
      }
    }),
    20,  );
  return raw
    .filter((m): m is InsiderMarket => m !== null)
    .filter((m) => m.whaleUsd >= WHALE_MIN && m.oneSided >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
}

interface Agg {
  name: string;
  buyUsd: [number, number]; // [outcome0, outcome1]
  buySh: [number, number];
  sellUsd: [number, number];
  usd: number;
  trades: number;
  lastTs: number;
}

export async function marketSmartMoney(cid: string): Promise<MarketSmartMoney> {
  const trades = await dataApiGet<PmTrade[]>(
    `/trades?market=${encodeURIComponent(cid)}&limit=${MARKET_TRADES}`,
    30,
  );

  const byW = new Map<string, Agg>();
  const outcomes: string[] = [];
  let buyUsd = 0;
  let sellUsd = 0;
  let net = 0; // toward outcome 0
  let biggest: MarketSmartMoney["flow"]["biggest"] = null;

  // Current price of outcome 0, normalized from the most recent fill (trades are
  // newest-first). A fill on outcome 1 at price p implies outcome 0 ≈ 1 − p.
  let curYes = 0;
  let curYesKnown = false;
  for (const t of trades) {
    if (t.price > 0 && t.price < 1) {
      curYes = t.outcomeIndex === 1 ? 1 - t.price : t.price;
      curYesKnown = true;
      break;
    }
  }

  for (const t of trades) {
    const usd = t.size * t.price;
    const oi = t.outcomeIndex === 1 ? 1 : 0;
    if (!outcomes[oi]) outcomes[oi] = t.outcome;
    if (t.side === "BUY") buyUsd += usd;
    else sellUsd += usd;
    // Net toward outcome 0: buy-0 / sell-1 push positive; buy-1 / sell-0 negative.
    net += (oi === 0 ? 1 : -1) * (t.side === "BUY" ? 1 : -1) * usd;
    const nm = t.name || t.pseudonym || "";
    if (!biggest || usd > biggest.usd) {
      biggest = { usd, side: t.side, outcome: t.outcome, price: t.price, name: nm || short(t.proxyWallet), ts: t.timestamp };
    }
    const a =
      byW.get(t.proxyWallet) ??
      { name: "", buyUsd: [0, 0], buySh: [0, 0], sellUsd: [0, 0], usd: 0, trades: 0, lastTs: 0 };
    a.name = a.name || nm;
    a.usd += usd;
    a.trades += 1;
    a.lastTs = Math.max(a.lastTs, t.timestamp);
    if (t.side === "BUY") {
      a.buyUsd[oi] += usd;
      a.buySh[oi] += t.size;
    } else {
      a.sellUsd[oi] += usd;
    }
    byW.set(t.proxyWallet, a);
  }

  const ranked = [...byW.entries()].sort((x, y) => y[1].usd - x[1].usd);
  const top = ranked.slice(0, TOP_WALLETS);
  const records = await pool(
    top.map(([w]) => () => walletStats(w)),
    RECORD_CONCURRENCY,
  );

  const traders: SharpTrader[] = top.map(([wallet, a], i) => {
    const yesDom = a.buyUsd[0] >= a.buyUsd[1];
    const sideIndex = yesDom ? 0 : 1;
    const side = outcomes[sideIndex] ?? (yesDom ? "Yes" : "No");
    const buyUsdSide = a.buyUsd[sideIndex];
    const buyShSide = a.buySh[sideIndex];
    const avgEntry = buyShSide > 0 ? buyUsdSide / buyShSide : 0;
    // Mark their side to the current price: outcome 0 = curYes, outcome 1 = 1−curYes.
    const sidePrice = sideIndex === 0 ? curYes : 1 - curYes;
    const unrealized = curYesKnown && avgEntry > 0 ? sidePrice - avgEntry : null;
    const r = records[i] ?? { bets: 0, wins: 0, known: false, value: 0 };
    return {
      wallet,
      name: a.name || short(wallet),
      side,
      sideIndex,
      marketUsd: a.usd,
      netUsd: buyUsdSide - a.sellUsd[sideIndex],
      avgEntry,
      unrealized,
      trades: a.trades,
      lastTs: a.lastTs,
      bets: r.bets,
      wins: r.wins,
      winRate: r.bets ? r.wins / r.bets : 0,
      recordKnown: r.known,
      value: r.value,
    };
  });

  const totalUsd = buyUsd + sellUsd;
  return {
    cid,
    outcomes,
    curYes,
    curYesKnown,
    flow: {
      buyUsd,
      sellUsd,
      totalUsd,
      netUsd: net,
      netSide: net >= 0 ? outcomes[0] ?? "Yes" : outcomes[1] ?? "No",
      traderCount: byW.size,
      biggest,
      topShare: ranked.length ? ranked[0][1].usd / (totalUsd || 1) : 0,
    },
    traders,
    sampledTrades: trades.length,
  };
}

// ── Wallet intelligence: proven wallets & 母鸡 clusters ──────────────────────
// Two archetypes the client toggles between. Both are heavy, so the routes cache
// daily - opening the page reads a saved snapshot, no live recompute / RPC.
export interface ProvenWallet {
  wallet: string;
  name: string;
  value: number;
  openPnl: number;
  openPnlPct: number;
  bets: number;
  wins: number;
  winRate: number;
  weekBets: number;
  priceLo: number;
  priceHi: number;
  activityCount: number;
  markets: number;
}

export interface MotherCluster {
  funder: string; // the 母鸡 (shared funding wallet)
  funderTxCount: number;
  count: number; // linked wallets
  members: { wallet: string; name: string }[];
  // aggregate across every linked wallet
  totalValue: number;
  totalOpenPnl: number;
  totalBets: number;
  totalWins: number;
  winRate: number;
  weekBets: number;
  priceLo: number;
  priceHi: number;
}

// Distinct wallets active across the busiest markets, with display name + how
// many of those markets they showed up in.
async function gatherWallets(
  cids: string[],
  perMarket = 6,
  maxMarkets = 16,
): Promise<Map<string, { name: string; markets: number }>> {
  const markets = [...new Set(cids)].slice(0, maxMarkets);
  const perMarketRows = await pool(
    markets.map((cid) => async () => {
      try {
        const trades = await dataApiGet<PmTrade[]>(`/trades?market=${encodeURIComponent(cid)}&limit=200`, 600);
        const byW = new Map<string, { name: string; usd: number }>();
        for (const t of trades) {
          const e = byW.get(t.proxyWallet) ?? { name: t.name || t.pseudonym || "", usd: 0 };
          e.usd += t.size * t.price;
          e.name = e.name || t.name || t.pseudonym || "";
          byW.set(t.proxyWallet, e);
        }
        return [...byW.entries()].sort((a, b) => b[1].usd - a[1].usd).slice(0, perMarket);
      } catch {
        return [] as [string, { name: string; usd: number }][];
      }
    }),
    20,  );
  const cand = new Map<string, { name: string; markets: number }>();
  for (const rows of perMarketRows) {
    for (const [w, info] of rows) {
      const e = cand.get(w) ?? { name: info.name, markets: 0 };
      e.markets += 1;
      e.name = e.name || info.name;
      cand.set(w, e);
    }
  }
  return cand;
}

const MIN_ESTABLISHED = 30; // ≥ this many lifetime activity rows = an "old" wallet

// Established (long-history) wallets ranked by current unrealized profit, with the
// full stat line the client filters on.
export async function provenWallets(cids: string[]): Promise<ProvenWallet[]> {
  const cand = await gatherWallets(cids);
  const list = [...cand.entries()].slice(0, 45);
  const books = await pool(list.map(([w]) => () => walletBook(w)), RECORD_CONCURRENCY);
  return list
    .map(([wallet, info], i) => {
      const b = books[i];
      return {
        wallet,
        name: info.name || short(wallet),
        markets: info.markets,
        value: b.value,
        openPnl: b.openPnl,
        openPnlPct: b.openPnlPct,
        bets: b.bets,
        wins: b.wins,
        winRate: b.winRate,
        weekBets: b.weekBets,
        priceLo: b.priceLo,
        priceHi: b.priceHi,
        activityCount: b.activityCount,
      };
    })
    .filter((w) => w.activityCount >= MIN_ESTABLISHED)
    .sort((a, b) => b.openPnl - a.openPnl)
    .slice(0, 30);
}

// 母鸡 clusters: take the fresh wallets loading longshots, trace their Polygon
// funding, and keep only groups that share a real (non-exchange) funder - the
// hidden insider operating many throwaway wallets from one source. Aggregate the
// whole cluster so a fresh wallet finally carries meaning.
export async function motherClusters(cids: string[]): Promise<MotherCluster[]> {
  const signals = await underdogScan(cids, true);
  const freshName = new Map<string, string>();
  for (const s of signals) for (const b of s.topBuyers) if (b.fresh) freshName.set(b.wallet.toLowerCase(), b.name);
  const wallets = [...freshName.keys()].slice(0, 30);
  if (wallets.length < 2) return [];

  const trace = await traceFunding(wallets, 30);
  const real = trace.clusters.filter((c) => !c.isExchange && c.wallets.length >= 2);
  if (!real.length) return [];

  const out: MotherCluster[] = [];
  for (const c of real) {
    const books = await pool(c.wallets.map((w) => () => walletBook(w)), RECORD_CONCURRENCY);
    let totalValue = 0;
    let totalOpenPnl = 0;
    let totalBets = 0;
    let totalWins = 0;
    let weekBets = 0;
    const prices: number[] = [];
    books.forEach((b) => {
      totalValue += b.value;
      totalOpenPnl += b.openPnl;
      totalBets += b.bets;
      totalWins += b.wins;
      weekBets += b.weekBets;
      if (b.priceLo > 0) prices.push(b.priceLo);
      if (b.priceHi > 0) prices.push(b.priceHi);
    });
    out.push({
      funder: c.funder,
      funderTxCount: c.funderTxCount,
      count: c.wallets.length,
      members: c.wallets.map((w) => ({ wallet: w, name: freshName.get(w.toLowerCase()) ?? short(w) })),
      totalValue,
      totalOpenPnl,
      totalBets,
      totalWins,
      winRate: totalBets ? totalWins / totalBets : 0,
      weekBets,
      priceLo: prices.length ? Math.min(...prices) : 0,
      priceHi: prices.length ? Math.max(...prices) : 0,
    });
  }
  return out.sort((a, b) => b.totalOpenPnl - a.totalOpenPnl);
}

// ── Cached, volume-floored scan entry points ────────────────────────────────
// Wrap each scan so the heavy compute is truly cached for an hour, keyed by the
// volume floor (the route reads minVol from the query, which would otherwise make
// the route dynamic and never-cached). Titles for the scanned markets ride along
// so the client needs no separate lookup, and works for markets beyond the top 60.
function titleMap(cands: Candidate[]): Record<string, { question: string; end_date_iso?: string | null }> {
  const t: Record<string, { question: string; end_date_iso?: string | null }> = {};
  for (const c of cands) t[c.condition_id] = { question: c.question, end_date_iso: c.end_date_iso };
  return t;
}

export function scanInsiders(minVol: number) {
  return unstable_cache(
    async () => {
      const cands = await candidatesAboveVolume(minVol);
      const markets = await insiderScan(cands.map((c) => c.condition_id));
      return { markets, titles: titleMap(cands), generatedAt: Date.now() };
    },
    ["scan-insiders", String(minVol)],
    { revalidate: 3600 },
  )();
}

export function scanUnderdog(minVol: number, fresh: boolean) {
  return unstable_cache(
    async () => {
      const cands = await candidatesAboveVolume(minVol);
      const signals = await underdogScan(cands.map((c) => c.condition_id), fresh);
      return { signals, titles: titleMap(cands), generatedAt: Date.now() };
    },
    ["scan-underdog", String(minVol), fresh ? "1" : "0"],
    { revalidate: 3600 },
  )();
}

export function scanProven(minVol: number) {
  return unstable_cache(
    async () => {
      const cands = await candidatesAboveVolume(minVol);
      const traders = await provenWallets(cands.map((c) => c.condition_id));
      return { traders, generatedAt: Date.now() };
    },
    ["scan-proven", String(minVol)],
    { revalidate: 3600 },
  )();
}

export function scanMothers(minVol: number) {
  return unstable_cache(
    async () => {
      const cands = await candidatesAboveVolume(minVol);
      const clusters = await motherClusters(cands.map((c) => c.condition_id));
      return { clusters, generatedAt: Date.now() };
    },
    ["scan-mothers", String(minVol)],
    { revalidate: 3600 },
  )();
}

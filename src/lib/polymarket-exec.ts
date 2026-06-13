import type { PmBook } from "./polymarket";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Time helpers - kept here so component code stays free of direct Date.now()
// (which the react-hooks purity rule flags in render scope).
export const nowMs = () => Date.now();
export const nowSec = () => Math.floor(Date.now() / 1000);

// Aggressive retry - trades aren't a normal API call; finish 3 attempts inside
// ~800ms (100 / 200 / 500ms). Caller should pass an idempotent fn (re-send the
// SAME signed order) so a retry never double-places.
const RETRY_DELAYS = [100, 200, 500];
export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < tries - 1) await sleep(RETRY_DELAYS[i] ?? 500);
    }
  }
  throw last;
}

// Fire-and-forget trade log → /api/pm-log (mock 200 until the droplet sink lands).
export interface TradeLog {
  ts: number;
  market: string;
  outcome?: string;
  side: string;
  mode: string;
  price?: number;
  size: number;
  status: string;
  order_id?: string;
  error?: string;
}
export function logTrade(record: TradeLog) {
  void fetch("/api/pm-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  }).catch(() => {});
}

// --- order book helpers ---
export function bestBid(book?: PmBook | null): number | null {
  if (!book?.bids?.length) return null;
  return Math.max(...book.bids.map((b) => +b.price));
}
export function bestAsk(book?: PmBook | null): number | null {
  if (!book?.asks?.length) return null;
  return Math.min(...book.asks.map((a) => +a.price));
}
export function mid(book?: PmBook | null): number | null {
  const b = bestBid(book);
  const a = bestAsk(book);
  if (b == null || a == null) return null;
  return (a + b) / 2;
}

// Expected average fill price for a market order walking `size` shares into the
// book, plus slippage vs mid. side BUY walks asks, SELL walks bids.
export function expectedFill(
  book: PmBook | null | undefined,
  side: "buy" | "sell",
  size: number,
): { avg: number; slippageBps: number } | null {
  if (!book || size <= 0) return null;
  const levels = (side === "buy" ? book.asks : book.bids)
    .map((l) => ({ price: +l.price, size: +l.size }))
    .sort((x, y) => (side === "buy" ? x.price - y.price : y.price - x.price));
  let remaining = size;
  let cost = 0;
  for (const lvl of levels) {
    const take = Math.min(remaining, lvl.size);
    cost += take * lvl.price;
    remaining -= take;
    if (remaining <= 0) break;
  }
  if (remaining > 0) return null; // not enough depth
  const avg = cost / size;
  const m = mid(book);
  const slippageBps = m ? Math.abs((avg - m) / m) * 10000 : 0;
  return { avg, slippageBps };
}

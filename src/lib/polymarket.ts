// Polymarket CLOB client. Reads go through the droplet polymarket-proxy
// (NL egress) which transparently forwards <METHOD> /proxy/<clob-path> →
// https://clob.polymarket.com/<clob-path>, gated by our bearer token (stripped
// before forwarding). Server-side only - the bearer token never reaches the
// browser. The proxy stores no Polymarket creds; L1/L2 signing is client-side.

export interface PmToken {
  token_id: string;
  outcome: string;
  price: number;
  winner?: boolean;
}

export interface PmMarket {
  condition_id: string;
  question_id?: string;
  question: string;
  market_slug: string;
  description?: string;
  active: boolean;
  closed: boolean;
  accepting_orders: boolean;
  neg_risk: boolean;
  minimum_tick_size: number;
  minimum_order_size: number;
  end_date_iso: string | null;
  icon?: string;
  tags?: string[];
  tokens: PmToken[];
}

export interface PmMarketsPage {
  data: PmMarket[];
  next_cursor: string;
  count: number;
  limit: number;
}

/** A position from data-api /positions?user= (already enriched with market + pnl). */
export interface PmPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  realizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  title: string;
  slug: string;
  outcome: string;
  outcomeIndex: number;
  endDate: string | null;
  negativeRisk: boolean;
}

// Read-only Polymarket data layer. By DEFAULT this hits Polymarket's public APIs
// directly, server-side, with no auth. If you're in a geo-restricted region, set
// POLYMARKET_PROXY_URL to your own transparent reverse proxy (it must forward
// /proxy → clob, /gamma → gamma, /data-api → data-api) and, optionally,
// INFRA_API_TOKEN as a bearer gate.
const PROXY = process.env.POLYMARKET_PROXY_URL?.replace(/\/+$/, "");
const TOKEN = process.env.INFRA_API_TOKEN;

const HOSTS = {
  clob: "https://clob.polymarket.com",
  gamma: "https://gamma-api.polymarket.com",
  data: "https://data-api.polymarket.com",
} as const;
// Proxy mount points (only used when POLYMARKET_PROXY_URL is set).
const MOUNT = { clob: "proxy", gamma: "gamma", data: "data-api" } as const;

function endpoint(kind: keyof typeof HOSTS, path: string): string {
  return PROXY ? `${PROXY}/${MOUNT[kind]}${path}` : `${HOSTS[kind]}${path}`;
}
function headers(): Record<string, string> {
  return PROXY && TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

// revalidate (seconds) caches the response so repeat navigations are instant;
// omit it (default no-store) for live data like the order book.
async function pmGet<T>(
  kind: keyof typeof HOSTS,
  path: string,
  revalidate?: number,
): Promise<T> {
  const res = await fetch(endpoint(kind, path), {
    headers: headers(),
    ...(revalidate ? { next: { revalidate } } : { cache: "no-store" }),
  });
  if (!res.ok) throw new Error(`polymarket ${kind} GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

const clobGet = <T>(path: string, revalidate?: number) =>
  pmGet<T>("clob", path, revalidate);

export interface PmBookLevel {
  price: string;
  size: string;
}
export interface PmBook {
  market: string;
  asset_id: string;
  bids: PmBookLevel[];
  asks: PmBookLevel[];
}

const gammaGet = <T>(path: string, revalidate?: number) =>
  pmGet<T>("gamma", path, revalidate);

// Polymarket data-api (trades / positions / activity).
export const dataApiGet = <T>(path: string, revalidate?: number) =>
  pmGet<T>("data", path, revalidate);

// Generic passthrough. Polymarket has not exposed a public historical-PnL
// endpoint, so callers that use this (wallet history) degrade to empty.
export const proxyJson = <T>(path: string, revalidate?: number) =>
  pmGet<T>("data", path, revalidate);

/** One filled trade from data-api /trades (size = outcome shares, price in [0,1]). */
export interface PmTrade {
  proxyWallet: string;
  side: "BUY" | "SELL";
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  outcome: string;
  outcomeIndex: number;
  name?: string;
  pseudonym?: string;
  title?: string;
  slug?: string;
}

/** A row from data-api /activity (TRADE | REDEEM | MERGE | …). */
export interface PmActivity {
  type: string;
  conditionId: string;
  usdcSize?: number;
  timestamp: number;
  side?: "BUY" | "SELL";
  price?: number;
  size?: number;
  outcome?: string;
  outcomeIndex?: number;
  title?: string;
  slug?: string;
}

/** A holding from data-api /positions (curPrice 0|1 once the market settles). */
export interface PmRawPosition {
  conditionId: string;
  curPrice: number;
  redeemable?: boolean;
  cashPnl?: number;
  percentPnl?: number;
  currentValue?: number;
  initialValue?: number;
  avgPrice?: number;
  size?: number;
  title?: string;
  slug?: string;
  outcome?: string;
  outcomeIndex?: number;
  asset?: string; // tokenId - lets a holding deep-link back into the terminal
  endDate?: string;
}

export const polymarket = {
  // Active, order-accepting markets (the tradeable set), one page (~1000).
  // Cached 60s - the list doesn't need to be real-time, and this makes the
  // Polymarket tab open instantly on repeat navigations.
  samplingMarkets: (cursor?: string) =>
    clobGet<PmMarketsPage>(
      `/sampling-markets${cursor ? `?next_cursor=${encodeURIComponent(cursor)}` : ""}`,
      60,
    ),

  // Single market by condition id.
  market: (conditionId: string) => clobGet<PmMarket>(`/markets/${conditionId}`),

  // Order book for one outcome token.
  book: (tokenId: string) =>
    clobGet<PmBook>(`/book?token_id=${encodeURIComponent(tokenId)}`),

  // Per-market signals joined by condition_id via gamma's condition_ids filter
  // (batched 50/req, parallel, cached 60s). Returns 24h volume PLUS anomaly inputs:
  //   spike = volume24hr / (volume1wk / 7) - today's volume vs this week's daily
  //           average. >2-3 means unusual activity (someone's piling in / news).
  //   chg   = oneWeekPriceChange (probability move over the week).
  marketSignals: async (
    conditionIds: string[],
  ): Promise<Record<string, { volume: number; spike: number; chg: number }>> => {
    const BATCH = 50;
    const batches: string[][] = [];
    for (let i = 0; i < conditionIds.length; i += BATCH) {
      batches.push(conditionIds.slice(i, i + BATCH));
    }
    const map: Record<string, { volume: number; spike: number; chg: number }> = {};
    await Promise.all(
      batches.map(async (ids) => {
        try {
          const qs = ids.map((id) => `condition_ids=${id}`).join("&");
          const rows = await gammaGet<
            Array<{
              conditionId?: string;
              volume24hr?: number;
              volume1wk?: number;
              oneWeekPriceChange?: number;
            }>
          >(`/markets?limit=${BATCH}&${qs}`, 60);
          for (const r of rows) {
            if (!r.conditionId) continue;
            const v24 = typeof r.volume24hr === "number" ? r.volume24hr : 0;
            const v1w = typeof r.volume1wk === "number" ? r.volume1wk : 0;
            const dailyAvg = v1w / 7;
            const spike = dailyAvg > 0 ? v24 / dailyAvg : v24 > 0 ? 1 : 0;
            const chg = typeof r.oneWeekPriceChange === "number" ? r.oneWeekPriceChange : 0;
            map[r.conditionId] = { volume: v24, spike, chg };
          }
        } catch {
          /* skip batch - its markets get no signal */
        }
      }),
    );
    return map;
  },
};

// Public APIs are always reachable; the optional proxy doesn't change that.
export const isPolymarketConfigured = () => true;

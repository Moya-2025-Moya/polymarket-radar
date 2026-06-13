// Layer 2 of the "母鸡" hunt: trace where fresh wallets got their money on
// Polygon and cluster any that share a funder. RPC-frugal by design - funding
// history is immutable, so everything is cached 24h and repeat traces cost zero.
//
// Budget per trace: one alchemy_getAssetTransfers per wallet (the earliest
// inbound transfer reveals the bootstrapping funder) + one eth_getTransactionCount
// only for funders that actually link ≥2 wallets (to tell a real distributor from
// an exchange/bridge hot wallet via its outbound-tx count). Both cached 24h.

const RPC = process.env.POLYGON_RPC_URL;
const DAY = 86_400;
// A funder that has sent this many txs is an exchange/bridge hot wallet serving
// everyone, not a person - sharing it does not mean "same owner".
const EXCHANGE_NONCE = 25_000;
const MAX_WALLETS = 6;

interface Transfer {
  from: string;
  value: number | null;
  asset: string | null;
  metadata?: { blockTimestamp?: string };
}

export interface FunderNode {
  wallet: string;
  funder: string | null;
  amount: number;
  ts: string;
}

export interface FundingCluster {
  funder: string;
  wallets: string[];
  isExchange: boolean; // shared funder is an exchange/bridge → not a real 母鸡
  funderTxCount: number;
}

export interface FundingTrace {
  rpcConfigured: boolean;
  nodes: FunderNode[];
  clusters: FundingCluster[];
  rpcCalls: number; // surfaced so the cost is visible
}

async function rpc<T>(method: string, params: unknown[], revalidate: number): Promise<T> {
  const res = await fetch(RPC as string, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    next: { revalidate },
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message ?? "rpc error");
  return j.result as T;
}

const ZERO = "0x0000000000000000000000000000000000000000";

// The wallet that provided the most capital → the real funder. Aggregates
// inbound ERC20 by sender, ignoring mints (from 0x0, i.e. bridged in) and tiny
// relayer/gas top-ups, then picks the dominant source by value.
async function firstFunder(wallet: string): Promise<FunderNode> {
  try {
    const r = await rpc<{ transfers: Transfer[] }>(
      "alchemy_getAssetTransfers",
      [
        {
          toAddress: wallet,
          category: ["erc20"],
          order: "asc",
          maxCount: "0x14",
          withMetadata: true,
          excludeZeroValue: true,
        },
      ],
      DAY,
    );
    const transfers = r?.transfers ?? [];
    const byFrom = new Map<string, { val: number; ts: string }>();
    for (const t of transfers) {
      const from = t.from.toLowerCase();
      if (from === ZERO) continue; // mint / bridge, not a real funder
      const e = byFrom.get(from) ?? { val: 0, ts: t.metadata?.blockTimestamp ?? "" };
      e.val += t.value ?? 0;
      byFrom.set(from, e);
    }
    let best: { from: string; val: number; ts: string } | null = null;
    for (const [from, e] of byFrom) {
      if (!best || e.val > best.val) best = { from, val: e.val, ts: e.ts };
    }
    if (!best) return { wallet, funder: null, amount: 0, ts: "" };
    return { wallet, funder: best.from, amount: best.val, ts: best.ts };
  } catch {
    return { wallet, funder: null, amount: 0, ts: "" };
  }
}

async function txCount(addr: string): Promise<number> {
  try {
    const hex = await rpc<string>("eth_getTransactionCount", [addr, "latest"], DAY);
    return parseInt(hex, 16) || 0;
  } catch {
    return 0;
  }
}

export async function traceFunding(wallets: string[], maxWallets = MAX_WALLETS): Promise<FundingTrace> {
  if (!RPC) return { rpcConfigured: false, nodes: [], clusters: [], rpcCalls: 0 };
  const uniq = [...new Set(wallets.map((w) => w.toLowerCase()))].slice(0, maxWallets);

  // One getAssetTransfers per wallet (cached 24h).
  const nodes: FunderNode[] = [];
  for (const w of uniq) nodes.push(await firstFunder(w));
  let rpcCalls = uniq.length;

  // Group by funder; only funders linking ≥2 wallets matter.
  const groups = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.funder) continue;
    const g = groups.get(n.funder) ?? [];
    g.push(n.wallet);
    groups.set(n.funder, g);
  }

  const clusters: FundingCluster[] = [];
  for (const [funder, ws] of groups) {
    if (ws.length < 2) continue;
    const n = await txCount(funder); // only the rare shared funders cost a call
    rpcCalls += 1;
    clusters.push({ funder, wallets: ws, isExchange: n > EXCHANGE_NONCE, funderTxCount: n });
  }
  clusters.sort((a, b) => b.wallets.length - a.wallets.length);

  return { rpcConfigured: true, nodes, clusters, rpcCalls };
}

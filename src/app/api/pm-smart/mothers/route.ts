// Mother-hen clusters: GET /api/pm-smart/mothers?minVol=<$k>
// Fresh longshot wallets (above the volume floor) grouped by shared on-chain
// funder. Cached 1h (keyed by floor); per-wallet funder lookups are cached 24h,
// so re-running hourly barely adds RPC (only newly-seen wallets get traced).
import { NextResponse } from "next/server";
import { scanMothers } from "@/lib/pm-smart";

export const revalidate = 3600;

export async function GET(req: Request) {
  const minVolK = Number(new URL(req.url).searchParams.get("minVol")) || 10;
  try {
    const data = await scanMothers(minVolK * 1000);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

// Established high-profit wallets: GET /api/pm-smart/proven?minVol=<$k>
// Wallets active across markets above the volume floor, ranked by profit. Heavy
// per-wallet reads, no RPC. Cached 1h (keyed by floor) via unstable_cache.
import { NextResponse } from "next/server";
import { scanProven } from "@/lib/pm-smart";

export const revalidate = 3600;

export async function GET(req: Request) {
  const minVolK = Number(new URL(req.url).searchParams.get("minVol")) || 10;
  try {
    const data = await scanProven(minVolK * 1000);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

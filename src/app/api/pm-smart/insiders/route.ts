// Cross-market insider scan: GET /api/pm-smart/insiders?minVol=<$k>
// Sweeps every market above the volume floor for concentrated one-sided whale
// flow. The heavy compute is cached 1h (keyed by the floor) via unstable_cache,
// so opening the page reads a saved snapshot. Returns markets + title map.
import { NextResponse } from "next/server";
import { scanInsiders } from "@/lib/pm-smart";

export const revalidate = 3600;

export async function GET(req: Request) {
  const minVolK = Number(new URL(req.url).searchParams.get("minVol")) || 10;
  try {
    const data = await scanInsiders(minVolK * 1000);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

// Underdog ("母鸡") scan: GET /api/pm-smart/underdog?minVol=<$k>&fresh=1
// Sweeps every market above the volume floor for big buys on cheap outcomes,
// clustered across low-history wallets. Cached 1h (keyed by floor + fresh).
import { NextResponse } from "next/server";
import { scanUnderdog } from "@/lib/pm-smart";

export const revalidate = 3600;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const minVolK = Number(url.searchParams.get("minVol")) || 10;
  const fresh = url.searchParams.get("fresh") !== "0";
  try {
    const data = await scanUnderdog(minVolK * 1000, fresh);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

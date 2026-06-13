// Candidate markets above the volume floor: GET /api/pm-smart/candidates?minVol=<$k>
// The shared market universe (cid, question, end, volume, spike, chg). Cached 1h.
// Used by the Overview for the movers list and by boards for titles/end-times.
import { NextResponse } from "next/server";
import { candidatesAboveVolume } from "@/lib/pm-smart";

export const revalidate = 3600;

export async function GET(req: Request) {
  const minVolK = Number(new URL(req.url).searchParams.get("minVol")) || 10;
  try {
    const candidates = await candidatesAboveVolume(minVolK * 1000);
    return NextResponse.json({ candidates });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

// Smart-money read for one market: GET /api/pm-smart/market?cid=<conditionId>.
// Heavy (fans out per-wallet track-record lookups) so it runs server-side with
// the proxy bearer and is cached 10min per market.
import { NextResponse } from "next/server";
import { marketSmartMoney } from "@/lib/pm-smart";

export const revalidate = 600;

export async function GET(req: Request) {
  const cid = new URL(req.url).searchParams.get("cid");
  if (!cid) {
    return NextResponse.json({ error: "missing cid" }, { status: 400 });
  }
  try {
    const data = await marketSmartMoney(cid);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

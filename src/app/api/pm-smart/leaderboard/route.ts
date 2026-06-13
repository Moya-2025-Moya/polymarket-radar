// Profit leaderboard: GET /api/pm-smart/leaderboard?cids=a,b,c
// Ranks the wallets active across the busiest markets by unrealized PnL. Heavy
// fan-out (per-wallet position reads) so it runs server-side, cached 5min.
import { NextResponse } from "next/server";
import { traderLeaderboard } from "@/lib/pm-smart";

export const revalidate = 300;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("cids") ?? "";
  const cids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!cids.length) {
    return NextResponse.json({ error: "missing cids" }, { status: 400 });
  }
  try {
    const traders = await traderLeaderboard(cids);
    return NextResponse.json({ traders });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

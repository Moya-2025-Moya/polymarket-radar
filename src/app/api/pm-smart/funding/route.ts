// On-demand funding trace: GET /api/pm-smart/funding?wallets=a,b,c
// Maps each wallet to its bootstrapping funder on Polygon and clusters any that
// share one. RPC-frugal + cached 24h (funding history never changes).
import { NextResponse } from "next/server";
import { traceFunding } from "@/lib/pm-funding";

export const revalidate = 86400;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("wallets") ?? "";
  const wallets = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!wallets.length) {
    return NextResponse.json({ error: "missing wallets" }, { status: 400 });
  }
  try {
    const trace = await traceFunding(wallets);
    return NextResponse.json(trace);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

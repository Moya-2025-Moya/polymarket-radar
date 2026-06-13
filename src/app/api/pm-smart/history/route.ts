// True historical P&L for one wallet: GET /api/pm-smart/history?addr=<wallet>
// Reads Polymarket's user-pnl API (cumulative $ time series) via the proxy. No
// RPC. Returns null fields gracefully until the /user-pnl passthrough is added.
import { NextResponse } from "next/server";
import { historicalPnl } from "@/lib/pm-smart";

export const revalidate = 3600;

export async function GET(req: Request) {
  const addr = new URL(req.url).searchParams.get("addr");
  if (!addr) return NextResponse.json({ error: "missing addr" }, { status: 400 });
  const pnl = await historicalPnl(addr);
  return NextResponse.json({ pnl }); // pnl is null until the endpoint is wired
}

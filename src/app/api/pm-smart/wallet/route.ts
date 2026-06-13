// Wallet drill-down: GET /api/pm-smart/wallet?addr=<wallet>
// Full open book + approximate record for one wallet - fetched on demand when
// the user expands a sharp trader in the smart-money panel. Cached 120s.
import { NextResponse } from "next/server";
import { walletBook } from "@/lib/pm-smart";

export const revalidate = 600;

export async function GET(req: Request) {
  const addr = new URL(req.url).searchParams.get("addr");
  if (!addr) {
    return NextResponse.json({ error: "missing addr" }, { status: 400 });
  }
  try {
    const book = await walletBook(addr);
    return NextResponse.json(book);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

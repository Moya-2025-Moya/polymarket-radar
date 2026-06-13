// Read-only forward to Polymarket's clob API (markets, book, prices-history).
import { makeForwarder } from "@/lib/pm-forward";

export const GET = makeForwarder("clob");

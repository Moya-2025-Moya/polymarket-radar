// Read-only forward to Polymarket's data-api (trades, positions, activity).
import { makeForwarder } from "@/lib/pm-forward";

export const GET = makeForwarder("data-api");

// Read-only server-side forwarder for the client board components. By DEFAULT it
// proxies to Polymarket's public APIs; if POLYMARKET_PROXY_URL is set it forwards
// to that reverse proxy instead (with an optional INFRA_API_TOKEN bearer). GET
// only — this dashboard never writes.
//   kind "clob"     → clob.polymarket.com      (markets, book, prices-history)
//   kind "data-api" → data-api.polymarket.com  (trades, positions, activity)

const PROXY = process.env.POLYMARKET_PROXY_URL?.replace(/\/+$/, "");
const TOKEN = process.env.INFRA_API_TOKEN;

const HOSTS = {
  clob: "https://clob.polymarket.com",
  "data-api": "https://data-api.polymarket.com",
} as const;
// Proxy mount points (only used when POLYMARKET_PROXY_URL is set).
const MOUNT = { clob: "proxy", "data-api": "data-api" } as const;

type Kind = keyof typeof HOSTS;

function targetUrl(kind: Kind, path: string[] | undefined, search: string): string {
  if (!path?.length) throw new Error("missing path");
  const encoded = path.map((seg) => {
    if (!seg || seg === "." || seg === ".." || seg.includes("/") || seg.includes("\\")) {
      throw new Error("invalid path segment");
    }
    return encodeURIComponent(seg);
  });
  const base = PROXY ? `${PROXY}/${MOUNT[kind]}` : HOSTS[kind];
  const u = new URL(`${base}/${encoded.join("/")}`);
  u.search = search;
  return u.toString();
}

export function makeForwarder(kind: Kind) {
  return async function forward(
    req: Request,
    ctx: { params: Promise<{ path: string[] }> },
  ) {
    const { path } = await ctx.params;
    const url = new URL(req.url);
    let target: string;
    try {
      target = targetUrl(kind, path, url.search);
    } catch (e) {
      return Response.json(
        { error: "invalid target", detail: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }

    const headers: Record<string, string> = {};
    if (PROXY && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
    const accept = req.headers.get("accept");
    if (accept) headers.accept = accept;

    try {
      const upstream = await fetch(target, { method: "GET", headers, cache: "no-store" });
      const buf = await upstream.arrayBuffer();
      return new Response(buf, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") || "application/json",
        },
      });
    } catch (e) {
      return Response.json(
        { error: "upstream request failed", detail: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }
  };
}

# polymarket.radar

A **read-only** Polymarket smart-money dashboard. Surfaces who's trading what —
sharp money, insiders, underdog signals, proven traders, and funding clusters —
computed live from Polymarket's public data. No wallet, no orders, no account:
just the intel.

Next.js 16 (App Router) · React 19 · Tailwind v4.

> Runs with **zero configuration**. Clone, install, run — it reads Polymarket's
> public APIs directly. No keys, no backend, no database.

## Boards

| Route | What |
|-------|------|
| `/polymarket/overview` | Digest — movers + your tracked wallets at a glance |
| `/polymarket` | Terminal — browse markets, live prices, order-book depth, price history, per-market smart-money |
| `/polymarket/insider` | Insider scan — markets with concentrated informed flow |
| `/polymarket/traders` | Proven traders + mother-wallet clusters |
| `/polymarket/underdog` | Underdog signals — fresh/contrarian positioning |

Wallets you follow are stored in your browser (localStorage) — nothing leaves
your machine.

## Run

```bash
npm install
npm run dev      # http://localhost:3000  → redirects to /polymarket/overview
npm run build    # production build
```

That's it. No `.env` needed.

## Where the data comes from

Everything is derived from Polymarket's **public** APIs, server-side:

- `clob.polymarket.com` — markets, order books, price history
- `data-api.polymarket.com` — trades, positions, activity
- `gamma-api.polymarket.com` — per-market volume / spike / weekly-move signals

The smart-money / insider / underdog scoring is the logic in `src/lib/pm-smart.ts`.

## Optional config (`.env.local`)

Everything is optional — see [`.env.example`](./.env.example):

- **`POLYMARKET_PROXY_URL`** — Polymarket geo-blocks some regions. If you can't
  reach it directly, point this at your own transparent reverse proxy.
- **`POLYGON_RPC_URL`** — an Alchemy Polygon endpoint (free tier) enables the
  Traders → "Mothers" funding-cluster trace. Every other board works without it.

## Layout

```
src/
  app/(app)/polymarket/   the 5 board routes
  app/api/
    pm/[...path]          read-only forward → clob.polymarket.com
    pm-data/[...path]     read-only forward → data-api.polymarket.com
    pm-smart/*            scan endpoints (smart-money / insider / underdog / …)
  components/polymarket/   board UIs + read-only market view
  lib/
    polymarket.ts          public-API data layer
    pm-smart.ts            smart-money / insider / underdog scoring
    pm-funding.ts          Polygon funding-cluster trace (optional RPC)
```

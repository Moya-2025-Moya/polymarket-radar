"use client";

import { useEffect, useMemo, useState } from "react";

// Probability history for one outcome token, drawn as a dependency-free inline
// SVG line. Data: CLOB GET /prices-history?market=<tokenId>&interval&fidelity,
// routed through /api/pm (same as the order book). Returns { history: [{t,p}] }.

type Range = "1d" | "1w" | "1m" | "max";
const RANGES: { key: Range; label: string; fidelity: number }[] = [
  { key: "1d", label: "1D", fidelity: 5 },
  { key: "1w", label: "1W", fidelity: 60 },
  { key: "1m", label: "1M", fidelity: 180 },
  { key: "max", label: "ALL", fidelity: 720 },
];

type Point = { t: number; p: number };

export function PriceChart({ tokenId, label }: { tokenId: string; label: string }) {
  const [range, setRange] = useState<Range>("1w");
  const [points, setPoints] = useState<Point[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    // Clear the stale chart while the new range loads (intentional reset).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPoints(null);
    setErr(false);
    const cfg = RANGES.find((r) => r.key === range)!;
    fetch(
      `/api/pm/prices-history?market=${encodeURIComponent(tokenId)}&interval=${range}&fidelity=${cfg.fidelity}`,
      { cache: "no-store" },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { history?: Point[] }) => {
        if (alive) setPoints(d.history ?? []);
      })
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [tokenId, range]);

  const geom = useMemo(() => {
    if (!points || points.length < 2) return null;
    const ps = points.map((p) => p.p);
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    const span = hi - lo || 1;
    const n = points.length;
    // pad y-range so the line isn't glued to the edges
    const pad = span * 0.15;
    const yLo = Math.max(0, lo - pad);
    const yHi = Math.min(1, hi + pad);
    const ySpan = yHi - yLo || 1;
    const coords = points.map((p, i) => {
      const x = (i / (n - 1)) * 100;
      const y = 100 - ((p.p - yLo) / ySpan) * 100;
      return [x, y] as const;
    });
    const line = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const area = `0,100 ${line} 100,100`;
    return { line, area, last: ps[n - 1], lo, hi };
  }, [points]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
          {label} probability
        </span>
        <div className="flex gap-1 text-[11px]">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded px-1.5 py-0.5 font-mono ${
                range === r.key ? "bg-elevated text-accent" : "text-faint hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {err ? (
        <p className="text-xs text-faint">No price history.</p>
      ) : !points ? (
        <div className="h-24 animate-pulse rounded bg-elevated/40" />
      ) : !geom ? (
        <p className="text-xs text-faint">Not enough history yet.</p>
      ) : (
        <div className="relative">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-24 w-full">
            <polygon points={geom.area} fill="rgba(84,201,138,0.10)" />
            <polyline
              points={geom.line}
              fill="none"
              stroke="rgb(84,201,138)"
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="mt-1 flex justify-between font-mono text-[11px] text-faint">
            <span>lo {geom.lo.toFixed(2)}</span>
            <span className="text-foreground">now {geom.last.toFixed(2)}</span>
            <span>hi {geom.hi.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

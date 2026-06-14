"use client";

import { useSyncExternalStore } from "react";

// User-defined bar for what counts as "sharp money" in the smart-money panel.
// A wallet is sharp when its sampled track record clears BOTH gates. Stored
// locally, adjustable live - changing it re-filters without refetching.

export interface SharpConfig {
  minBets: number; // minimum resolved bets sampled
  minWinRate: number; // minimum win rate, 0..1
}

const KEY = "pm_sharp_config";
const DEFAULT: SharpConfig = { minBets: 30, minWinRate: 0.7 };

let config: SharpConfig = load();
const listeners = new Set<() => void>();

function load(): SharpConfig {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return { ...DEFAULT, ...parsed };
    return { ...DEFAULT };
  } catch {
    return { ...DEFAULT };
  }
}

export function setSharpConfig(patch: Partial<SharpConfig>): void {
  config = { ...config, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function useSharpConfig(): SharpConfig {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => config,
    () => DEFAULT,
  );
}

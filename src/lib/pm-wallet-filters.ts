"use client";

import { useSyncExternalStore } from "react";

// Thresholds for the two wallet views, adjusted with steppers and applied
// instantly client-side (the routes return a generous superset). Stored locally.
export interface WalletFilters {
  provenMinBets: number; // proven: min resolved bets (sample size)
  provenMinWin: number; // proven: min win rate 0..1
  motherMinWallets: number; // min linked wallets in a cluster
  scanMinVolume: number; // skip markets below this 24h volume (in $k) when scanning
}

const KEY = "pm_wallet_filters";
const DEFAULT: WalletFilters = { provenMinBets: 20, provenMinWin: 0.55, motherMinWallets: 2, scanMinVolume: 10 };

let filters: WalletFilters = load();
const listeners = new Set<() => void>();

function load(): WalletFilters {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return { ...DEFAULT, ...parsed };
    return { ...DEFAULT };
  } catch {
    return { ...DEFAULT };
  }
}

export function setWalletFilters(patch: Partial<WalletFilters>): void {
  filters = { ...filters, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function useWalletFilters(): WalletFilters {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => filters,
    () => DEFAULT,
  );
}

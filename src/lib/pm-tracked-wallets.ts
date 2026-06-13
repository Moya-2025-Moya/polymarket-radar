"use client";

import { useSyncExternalStore } from "react";

// Wallets you follow for copy-trade intel. Stored locally (single user). Each
// entry remembers the last trade timestamp we showed so the Traders page can
// flag genuinely NEW activity since you last looked.
export interface TrackedWallet {
  address: string;
  label: string; // display name captured when you followed
  addedAt: number;
  seenTradeTs: number; // newest trade ts acknowledged
}

const KEY = "pm_tracked_wallets";

let list: TrackedWallet[] = load();
const listeners = new Set<() => void>();

function load(): TrackedWallet[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function isTracked(address: string): boolean {
  const a = address.toLowerCase();
  return list.some((w) => w.address.toLowerCase() === a);
}

export function toggleTracked(address: string, label: string): void {
  const a = address.toLowerCase();
  if (list.some((w) => w.address.toLowerCase() === a)) {
    list = list.filter((w) => w.address.toLowerCase() !== a);
  } else {
    list = [...list, { address, label, addedAt: nowSec(), seenTradeTs: 0 }];
  }
  persist();
}

export function markSeen(address: string, ts: number): void {
  const a = address.toLowerCase();
  let changed = false;
  list = list.map((w) => {
    if (w.address.toLowerCase() === a && ts > w.seenTradeTs) {
      changed = true;
      return { ...w, seenTradeTs: ts };
    }
    return w;
  });
  if (changed) persist();
}

function nowSec(): number {
  // Date.now is fine here - this runs from an event handler, not render.
  return Math.floor(Date.now() / 1000);
}

export function useTrackedWallets(): TrackedWallet[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => list,
    () => [],
  );
}

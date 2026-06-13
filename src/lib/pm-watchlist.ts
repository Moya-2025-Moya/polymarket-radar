"use client";

import { useSyncExternalStore } from "react";

// Starred markets, persisted in localStorage. Same subscribable-store shape as
// alarms so the left list star toggle and the filter stay in sync. Canonical
// state is a Set (O(1) membership for the 1000-row list); it's replaced (not
// mutated) on change so useSyncExternalStore sees a new reference.

const STORAGE_KEY = "pm_watchlist";
const EMPTY: Set<string> = new Set();

let ids: Set<string> = new Set(load());
const listeners = new Set<() => void>();

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const l of listeners) l();
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getWatchlist(): Set<string> {
  return ids;
}

export function toggleWatch(conditionId: string): void {
  const next = new Set(ids);
  if (next.has(conditionId)) next.delete(conditionId);
  else next.add(conditionId);
  ids = next;
  persist();
  emit();
}

export function useWatchlist(): Set<string> {
  return useSyncExternalStore(subscribe, getWatchlist, () => EMPTY);
}

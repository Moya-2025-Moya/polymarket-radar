"use client";

import { useSyncExternalStore } from "react";

// Operation history - every action you take through the terminal lands here
// (order, cancel, approve, fund, withdraw, close). A unified operation history
// is a core value of the terminal; this is it. Local, single-user.

export type ActivityKind =
  | "order"
  | "cancel"
  | "reprice"
  | "approve"
  | "fund"
  | "withdraw"
  | "close"
  | "deploy";

export interface Activity {
  id: string;
  ts: number;
  kind: ActivityKind;
  text: string;
  ok: boolean;
  detail?: string; // error message or tx hash
}

const KEY = "pm_activity";
const MAX = 200;
const EMPTY: Activity[] = [];

let items: Activity[] = load();
let seq = 0;
const listeners = new Set<() => void>();

function load(): Activity[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const l of listeners) l();
}

/** Record an action. ts is passed in (callers are event handlers, not render). */
export function logActivity(a: Omit<Activity, "id">): void {
  const item: Activity = { ...a, id: `${a.ts}-${seq++}` };
  items = [item, ...items].slice(0, MAX);
  persist();
  emit();
}

export function getActivity(): Activity[] {
  return items;
}

export function useActivity(): Activity[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getActivity,
    () => EMPTY,
  );
}

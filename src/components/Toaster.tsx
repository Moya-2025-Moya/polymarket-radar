"use client";

import { useEffect, useRef, useState } from "react";
import { useActivity, type Activity } from "@/lib/pm-activity";

// Global, zero-wiring feedback: watches the operation log and surfaces each NEW
// action as a transient toast. Because every order/cancel/fund/reprice already
// calls logActivity, this gives loud, consistent confirmation everywhere without
// threading a toast() call through each handler.
export function Toaster() {
  const items = useActivity();
  const [toasts, setToasts] = useState<Activity[]>([]);
  const seen = useRef<string | null>(null);
  const inited = useRef(false);

  useEffect(() => {
    const latest = items[0];
    // On first mount, mark current head as seen - don't replay history.
    if (!inited.current) {
      inited.current = true;
      seen.current = latest?.id ?? null;
      return;
    }
    if (!latest || latest.id === seen.current) return;
    seen.current = latest.id;
    setToasts((t) => [latest, ...t].slice(0, 4));
    const id = latest.id;
    const timer = setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      4500,
    );
    return () => clearTimeout(timer);
  }, [items]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 rounded-md border bg-surface px-3 py-2 text-xs shadow-lg ${
            t.ok ? "border-pos/30" : "border-neg/40"
          }`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.ok ? "bg-pos" : "bg-neg"}`} />
          <span className={`font-mono ${t.ok ? "text-foreground" : "text-neg"}`}>{t.text}</span>
          {t.detail && <span className="font-mono text-faint">{t.detail}</span>}
        </div>
      ))}
    </div>
  );
}

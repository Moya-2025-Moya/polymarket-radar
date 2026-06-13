"use client";

import { useEffect } from "react";

// Graceful recovery for client errors. A stale chunk after a redeploy (the JS
// hash changed under an open tab) throws a ChunkLoadError on navigation — instead
// of a dead page, hard-reload to pull the fresh build. Other errors get a retry.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunk = /chunk|Loading.*failed|dynamically imported/i.test(error?.message ?? "");

  useEffect(() => {
    if (isChunk && typeof window !== "undefined") {
      window.location.reload(); // fresh build, fresh chunks
    }
  }, [isChunk]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="text-sm text-muted">
        {isChunk ? "Loading the latest version…" : "Something hiccuped on this page."}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => reset()}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-elevated"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

// Warm the scan caches in the background on server startup, so the first user
// after a deploy/restart hits a warm snapshot instead of a cold multi-second
// compute. Fire-and-forget (never blocks boot or the healthcheck); failures are
// swallowed so a cold cache just falls back to compute-on-request.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  setTimeout(() => {
    void (async () => {
      try {
        const m = await import("@/lib/pm-smart");
        const v = 10_000; // the default $10k volume floor
        await Promise.allSettled([
          m.candidatesAboveVolume(v),
          m.scanInsiders(v),
          m.scanUnderdog(v, true),
          m.scanUnderdog(v, false),
          m.scanProven(v),
          m.scanMothers(v),
        ]);
      } catch {
        /* cache stays cold; requests compute on demand */
      }
    })();
  }, 4000);
}

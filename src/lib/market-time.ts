// Compact, human market-resolution label shared by the market list and the scan
// cards. Pass nowMs in (from the nowMs() wrapper) so this stays pure for render.
export function endLabel(
  iso: string | null | undefined,
  now: number,
): { text: string; urgent: boolean; ended: boolean } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = t - now;
  if (diff <= 0) return { text: "ended", urgent: false, ended: true };
  const days = diff / 86_400_000;
  if (days < 1) {
    const h = Math.max(1, Math.round(diff / 3_600_000));
    return { text: `${h}h left`, urgent: true, ended: false };
  }
  if (days < 7) return { text: `${Math.round(days)}d left`, urgent: days < 2, ended: false };
  // Argument-given Date is allowed (only argless new Date()/Date.now() are barred).
  const label = new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { text: label, urgent: false, ended: false };
}

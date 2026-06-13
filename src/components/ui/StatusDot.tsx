type Tone = "ok" | "warn" | "bad" | "idle";

const color: Record<Tone, string> = {
  ok: "bg-pos",
  warn: "bg-warn",
  bad: "bg-neg",
  idle: "bg-faint",
};

export function StatusDot({ tone, label }: { tone: Tone; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${color[tone]}`} />
      {label && <span className="text-sm text-foreground">{label}</span>}
    </span>
  );
}

/** Map common state strings to a tone. */
export function toneFor(state: string): Tone {
  switch (state) {
    case "running":
    case "online":
    case "active":
    case "ok":
      return "ok";
    case "paused":
    case "stopped":
      return "warn";
    case "error":
    case "errored":
      return "bad";
    default:
      return "idle";
  }
}

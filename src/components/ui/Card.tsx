import type { ReactNode } from "react";

// Flat section - structure comes from a quiet label + hairline + spacing, not a
// bordered box. Use page-level gaps to separate sections.
export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between border-b border-hairline pb-2">
          {title && (
            <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type Tone = "pos" | "neg" | "warn" | "neutral";

const toneClass: Record<Tone, string> = {
  pos: "text-pos",
  neg: "text-neg",
  warn: "text-warn",
  neutral: "text-muted",
};

// The signature element: a big mono number with a small, quiet label.
export function Stat({
  label,
  value,
  delta,
  deltaTone = "neutral",
  hint,
  accent = false,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: Tone;
  hint?: string;
  accent?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div
        className={`mt-2 font-mono tracking-tight ${
          size === "lg" ? "text-4xl" : "text-3xl"
        } ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </div>
      {(delta || hint) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {delta && (
            <span className={`font-mono ${toneClass[deltaTone]}`}>{delta}</span>
          )}
          {hint && <span className="text-faint">{hint}</span>}
        </div>
      )}
    </div>
  );
}

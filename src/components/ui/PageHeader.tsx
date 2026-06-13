import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// An empty state is an invitation to act, not a dash. Lead with what to do.
export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="py-6">
      <div className="text-sm text-foreground">{title}</div>
      {hint && <div className="mt-1 text-sm text-muted">{hint}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** Quiet pending note (data source not wired / fetching). No box. */
export function Pending({ note }: { note: string }) {
  return <div className="py-5 text-sm text-muted">{note}</div>;
}

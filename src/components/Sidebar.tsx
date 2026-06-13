"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV: { href: string; label: string }[] = [
  { href: "/polymarket/overview", label: "Overview" },
  { href: "/polymarket", label: "Terminal" },
  { href: "/polymarket/insider", label: "Insider scan" },
  { href: "/polymarket/traders", label: "Traders" },
  { href: "/polymarket/underdog", label: "Underdog" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-hairline px-4 py-6">
      <div className="px-2 pb-8">
        <div className="font-display text-base tracking-tight text-foreground">
          polymarket<span className="text-accent">.</span>radar
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          smart-money · read-only
        </div>
      </div>
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
              active
                ? "bg-elevated text-foreground"
                : "text-muted hover:bg-elevated/50 hover:text-foreground"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
            )}
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pos" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

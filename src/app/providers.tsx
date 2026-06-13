"use client";

import { type ReactNode } from "react";

// Read-only dashboard: no wallet / query providers needed — the boards fetch
// their own data server-side. Kept as a thin wrapper so layout stays stable.
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

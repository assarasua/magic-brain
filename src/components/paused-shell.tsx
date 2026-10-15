"use client";

import { usePathname } from "next/navigation";

/** Also omit retired client screens during prerendering, where Proxy does not run. */
export function PausedShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return ["/", "/privacy", "/cookies", "/terms"].includes(pathname) ? children : null;
}

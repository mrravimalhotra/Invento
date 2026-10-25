"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installUnsavedGuard } from "@/lib/unsaved-guard";

// UX-09: warns before leaving a page with unsaved form input (rules in lib/unsaved-guard.ts).
// A new page starts clean: the guard is re-installed whenever the page changes.
export function UnsavedChangesGuard() {
  const pathname = usePathname();
  useEffect(() => installUnsavedGuard(), [pathname]);
  return null;
}

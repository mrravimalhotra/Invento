"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { rememberListUrl } from "@/lib/list-memory";

// UX-16: remembers the address (with its filters) of every page seen in this tab,
// so a record page's back link can return to its list as it was left.
export function ListUrlMemory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => rememberListUrl(pathname, search), [pathname, search]);
  return null;
}

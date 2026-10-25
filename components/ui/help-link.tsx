"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { helpHref } from "@/lib/help-links";

// UX-17: "Help" beside the page title, opening this screen's section of the User Guide.
export function HelpLink() {
  const href = helpHref(usePathname());
  if (!href) return null;
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted hover:text-foreground hover:underline max-md:min-h-11"
    >
      <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      Help
    </Link>
  );
}

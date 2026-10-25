"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { markReturnTo, recallListUrl } from "@/lib/list-memory";

// UX-16: "← Back to <list>" above a record page's title. Opens the list as it was
// last seen in this tab (its filters and search), or the plain list.
export function BackLink({ href, label }: { href: string; label: string }) {
  const [target, setTarget] = useState(href);
  useEffect(() => {
    // Read after mount: the remembered address lives in this tab's storage only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(recallListUrl(href));
  }, [href]);
  return (
    <Link
      href={target}
      prefetch={false}
      onClick={() => markReturnTo(href)}
      className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground max-md:min-h-11"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to {label}
    </Link>
  );
}

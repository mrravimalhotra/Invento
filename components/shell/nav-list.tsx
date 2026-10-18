"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/lib/constants/nav";
import { cn } from "@/lib/utils";

/**
 * The grouped menu links. Shared by the fixed desktop sidebar and the
 * slide-in phone menu so the two can never drift apart. `onNavigate` lets the
 * phone menu close itself when a link is tapped.
 */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main menu" className="flex-1 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="mb-4">
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {group.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    // Without this every sidebar link asks the server for its page as soon as it is
                    // on screen: about 25 requests, each with a sign-in check and database reads,
                    // on every page load. Pages have a loading screen, so a click still answers at once.
                    prefetch={false}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors max-md:min-h-11",
                      active
                        ? "bg-brand-light text-brand-dark font-medium"
                        : "text-foreground/80 hover:bg-black/5"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

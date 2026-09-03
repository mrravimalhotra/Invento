"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/inventory", label: "Ledger" },
  { href: "/inventory/balance", label: "Stock Position" },
  { href: "/inventory/rm-report", label: "RM Report As On Date" },
];

export function InventoryTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-4 flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-brand text-brand-dark"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

import { Suspense } from "react";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { LogOut, UserCircle, TriangleAlert } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";

async function LowStockBanner() {
  const supabase = await createClient();
  const { data: items } = await fetchAllRows((from, to) =>
    supabase
      .from("items")
      .select("id, name, item_code, low_stock_threshold")
      .not("low_stock_threshold", "is", null)
      .eq("active", true)
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (!items?.length) return null;

  // Scoped to just the items with a threshold set (usually a small subset of
  // the catalog), rather than every item in stock_balance. stock_balance
  // (0001_init.sql) is a plain view that re-aggregates inventory_ledger from
  // scratch on every query with no WHERE of its own — an unfiltered select
  // here forces a full scan of the ENTIRE ledger (which only grows, on every
  // purchase/QC/production/packaging transaction) just to render this
  // banner. Supabase compiles .in() to a literal `item_id IN (...)` list,
  // which Postgres CAN push down through the view's GROUP BY using the
  // inventory_ledger.item_id index (0056_performance_indexes.sql) — verified
  // locally: an unfiltered query against a 100k-row ledger took ~27ms (full
  // seq scan + aggregate every row), the same query scoped to 5 item_ids via
  // a literal IN list took <1ms (index scan of ~1,000 relevant rows only).
  const itemIds = items.map((it) => it.id);
  // ACC-08: in chunks, so a large set of threshold items never makes an
  // over-long request (each chunk is still a literal IN list, as above).
  const { data: balances } = await fetchByIdChunks<{ item_id: string; on_hand: number }>(itemIds, (chunk) =>
    supabase.from("stock_balance").select("item_id, on_hand").in("item_id", chunk)
  );
  const balanceMap = new Map((balances ?? []).map((b) => [b.item_id, Number(b.on_hand)]));

  const low = items.filter((it) => (balanceMap.get(it.id) ?? 0) < Number(it.low_stock_threshold));
  if (low.length === 0) return null;

  return (
    <Link
      href="/items"
      className="flex items-center gap-1.5 rounded-full bg-amber-bg px-3 py-1 text-xs font-medium text-amber hover:opacity-80"
    >
      <TriangleAlert className="h-3.5 w-3.5" />
      {low.length} item{low.length > 1 ? "s" : ""} low on stock
    </Link>
  );
}

export function Topbar({ user }: { user: CurrentUser }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-5">
      <div />
      <div className="flex items-center gap-3">
        {/*
          Suspense-wrapped so this banner's own queries never hold up the
          rest of the page. Topbar renders on EVERY dashboard route (it's
          in the shared layout), and LowStockBanner is an async Server
          Component with no boundary of its own before this change — without
          Suspense, Next.js has to wait for its queries to resolve before it
          can render anything else in this render pass, meaning every single
          page (including data-light ones like Dead Stock or Finished
          Product) was paying this banner's full cost on top of its own.
          fallback={null} because there's nothing meaningful to show while
          it loads — the banner appearing a beat after the rest of the page
          reads fine, the same "don't block on something non-critical"
          principle as the page-level loading.tsx fix (docs/modules/shell.md).
        */}
        <Suspense fallback={null}>
          <LowStockBanner />
        </Suspense>
        <div className="flex items-center gap-2 text-sm">
          <UserCircle className="h-5 w-5 text-muted" />
          <div className="leading-tight">
            <p className="font-medium">{user.fullName}</p>
            <p className="text-xs text-muted">
              {user.roles.length ? user.roles.map((r) => ROLE_LABELS[r]).join(", ") : "No roles assigned"}
            </p>
          </div>
        </div>
        <Link href="/profile" className="text-xs text-brand hover:underline">
          Profile
        </Link>
        <form action={signOut}>
          <button className="flex items-center gap-1 text-xs text-muted hover:text-red" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}

import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import { LogOut, UserCircle, TriangleAlert } from "lucide-react";
import type { CurrentUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";

async function LowStockBanner() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("items")
    .select("id, name, item_code, low_stock_threshold")
    .not("low_stock_threshold", "is", null)
    .eq("active", true);
  if (!items?.length) return null;

  const { data: balances } = await supabase.from("stock_balance").select("item_id, on_hand");
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
        <LowStockBanner />
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

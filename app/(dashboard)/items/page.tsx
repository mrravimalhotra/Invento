import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ItemsTable, type ItemRow } from "./items-table";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);

  // FB-0006: sort newest-first by created_at rather than alphabetically by
  // item_code. Alphabetical order buried freshly-created Raw material/
  // Packaging items (RM-/PKG-) behind ~1000 legacy-imported rows (prefixed
  // LEG-, which sorts before RM/PKG but after FP alphabetically), pushing
  // new items past DataTable's client-side 15-rows/page slice — a newly
  // added item was effectively invisible without searching or paging deep.
  let query = supabase
    .from("items")
    .select("id, item_code, name, category, unit, active, low_stock_threshold, item_types(description), created_at")
    .order("created_at", { ascending: false });
  if (category && category !== "all") query = query.eq("category", category);

  const [{ data: itemsData }, { data: balances }] = await Promise.all([
    query,
    supabase.from("stock_balance").select("item_id, on_hand"),
  ]);

  const balanceMap = new Map((balances ?? []).map((b) => [b.item_id, Number(b.on_hand)]));

  const rows: ItemRow[] = (itemsData ?? []).map((it) => ({
    ...it,
    // Supabase types this as an array in TS but the FK is many-to-one; take the first.
    item_types: Array.isArray(it.item_types) ? it.item_types[0] ?? null : it.item_types,
    on_hand: balanceMap.get(it.id) ?? 0,
    hasBalance: balanceMap.has(it.id),
  })) as unknown as ItemRow[];

  const canCreate = canWrite(user?.roles ?? [], "items");

  const tabs = [
    { key: "all", label: "All" },
    { key: "raw", label: "Raw material" },
    { key: "packaging", label: "Packaging" },
    { key: "processed", label: "Finished product" },
  ];
  const active = category && tabs.some((t) => t.key === category) ? category : "all";

  return (
    <div>
      <PageHeader
        title="Item Master"
        description="Raw materials, finished products, and packaging materials."
        action={canCreate ? <LinkButton href="/items/new">New item</LinkButton> : undefined}
      />
      <div className="mb-4 flex gap-1.5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/items" : `/items?category=${t.key}`}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              active === t.key ? "bg-brand text-white" : "bg-black/5 text-muted hover:bg-black/10"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Card>
        <ItemsTable rows={rows} />
      </Card>
    </div>
  );
}

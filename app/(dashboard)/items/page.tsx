import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatNumber, cn } from "@/lib/utils";
import Link from "next/link";

const CATEGORY_LABELS: Record<string, string> = {
  raw: "Raw material",
  processed: "Processed",
  packaging: "Packaging",
};

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  category: string;
  unit: string | null;
  active: boolean;
  low_stock_threshold: string | number | null;
  item_types: { description: string } | null;
  on_hand: number;
};

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);

  let query = supabase
    .from("items")
    .select("id, item_code, name, category, unit, active, low_stock_threshold, item_types(description)")
    .order("item_code", { ascending: true });
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
  })) as unknown as ItemRow[];

  const canCreate = canWrite(user?.roles ?? [], "items");

  const tabs = [
    { key: "all", label: "All" },
    { key: "raw", label: "Raw material" },
    { key: "packaging", label: "Packaging" },
    { key: "processed", label: "Processed" },
  ];
  const active = category && tabs.some((t) => t.key === category) ? category : "all";

  const columns: Column<ItemRow>[] = [
    {
      header: "Item code",
      accessor: (r) => (
        <Link href={`/items/${r.id}`} className="font-medium text-brand hover:underline">
          {r.item_code}
        </Link>
      ),
      searchValue: (r) => r.item_code,
    },
    { header: "Name", accessor: (r) => r.name, searchValue: (r) => r.name },
    { header: "Category", accessor: (r) => CATEGORY_LABELS[r.category] ?? r.category },
    { header: "Type", accessor: (r) => r.item_types?.description ?? "—" },
    { header: "Unit", accessor: (r) => r.unit ?? "—" },
    {
      header: "Stock on hand",
      accessor: (r) => (balanceMap.has(r.id) ? formatNumber(r.on_hand) : "—"),
    },
    {
      header: "Low stock",
      accessor: (r) =>
        r.low_stock_threshold != null && r.on_hand < Number(r.low_stock_threshold) ? (
          <Badge status="rejected">Low</Badge>
        ) : null,
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.active ? "approved" : "not_submitted"}>{r.active ? "Active" : "Inactive"}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Item Master"
        description="Raw materials, processed items, and packaging materials."
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
        <DataTable columns={columns} rows={rows} searchPlaceholder="Search items…" emptyLabel="No items yet." />
      </Card>
    </div>
  );
}

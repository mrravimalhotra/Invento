import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatNumber } from "@/lib/utils";

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
  low_stock_threshold: string | number | null;
  category: string;
};

type BalanceRow = ItemRow & {
  onHand: number;
  low: boolean;
};

export default async function StockBalancePage() {
  const supabase = await createClient();

  const [{ data: items, error: itemsError }, { data: balances, error: balanceError }] = await Promise.all([
    supabase
      .from("items")
      .select("id, item_code, name, unit, low_stock_threshold, category")
      .eq("active", true)
      .order("name", { ascending: true })
      .returns<ItemRow[]>(),
    supabase.from("stock_balance").select("item_id, on_hand"),
  ]);

  const balanceMap = new Map((balances ?? []).map((b) => [b.item_id as string, Number(b.on_hand)]));

  const rows: BalanceRow[] = (items ?? []).map((it) => {
    const onHand = balanceMap.get(it.id) ?? 0;
    const threshold = it.low_stock_threshold === null ? null : Number(it.low_stock_threshold);
    return { ...it, onHand, low: threshold !== null && onHand < threshold };
  });

  const columns: Column<BalanceRow>[] = [
    {
      header: "Item",
      accessor: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-muted">{r.item_code}</div>
        </div>
      ),
      searchValue: (r) => `${r.name} ${r.item_code}`,
    },
    {
      header: "Category",
      accessor: (r) => <span className="capitalize">{r.category}</span>,
      searchValue: (r) => r.category,
    },
    {
      header: "On hand",
      accessor: (r) => (
        <span className={r.low ? "font-semibold text-red" : "font-medium"}>
          {formatNumber(r.onHand)} {r.unit}
        </span>
      ),
      sortValue: (r) => r.onHand,
    },
    {
      header: "Low-stock threshold",
      accessor: (r) => (r.low_stock_threshold === null ? "—" : `${formatNumber(r.low_stock_threshold)} ${r.unit ?? ""}`),
    },
    {
      header: "Status",
      accessor: (r) =>
        r.low_stock_threshold === null ? (
          <span className="text-xs text-muted">No threshold set</span>
        ) : r.low ? (
          <Badge status="rejected">Low stock</Badge>
        ) : (
          <Badge status="approved">OK</Badge>
        ),
    },
  ];

  return (
    <Card>
      {(itemsError || balanceError) && (
        <p className="p-4 text-sm text-red">{itemsError?.message ?? balanceError?.message}</p>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        searchPlaceholder="Search item name or code…"
        emptyLabel="No active items yet."
        pageSize={20}
      />
    </Card>
  );
}

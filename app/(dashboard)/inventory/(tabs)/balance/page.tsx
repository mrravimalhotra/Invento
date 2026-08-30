import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { StockBalanceTable, type BalanceRow } from "./stock-balance-table";

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
  low_stock_threshold: string | number | null;
  category: string;
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

  return (
    <Card>
      {(itemsError || balanceError) && (
        <p className="p-4 text-sm text-red">{itemsError?.message ?? balanceError?.message}</p>
      )}
      <StockBalanceTable rows={rows} />
    </Card>
  );
}

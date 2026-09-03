import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { StockPositionTable, type PositionRow } from "./stock-position-table";

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
  low_stock_threshold: string | number | null;
  category: string;
};

// item_position (0031_stock_position.sql) — one row per item (including
// items with zero ledger activity), generic breakdown columns the page
// picks from per category. `on_hand` is computed with the exact same
// expression stock_balance already used, so it can be relied on the same
// way — this replaces the separate stock_balance query the old Stock
// Balance page made, not just adds to it.
type PositionQueryRow = {
  item_id: string;
  received: string | number;
  yielded: string | number;
  held_qc: string | number;
  held_stability: string | number;
  held_rnd: string | number;
  consumed_by_fp: string | number;
  issued_packaging: string | number;
  wastage: string | number;
  on_hand: string | number;
};

export default async function StockPositionPage() {
  const supabase = await createClient();

  const [{ data: items, error: itemsError }, { data: positions, error: positionError }] = await Promise.all([
    supabase
      .from("items")
      .select("id, item_code, name, unit, low_stock_threshold, category")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .returns<ItemRow[]>(),
    supabase
      .from("item_position")
      .select(
        "item_id, received, yielded, held_qc, held_stability, held_rnd, consumed_by_fp, issued_packaging, wastage, on_hand"
      )
      .returns<PositionQueryRow[]>(),
  ]);

  const positionMap = new Map((positions ?? []).map((p) => [p.item_id, p]));

  const rows: PositionRow[] = (items ?? []).map((it) => {
    const p = positionMap.get(it.id);
    const onHand = p ? Number(p.on_hand) : 0;
    const threshold = it.low_stock_threshold === null ? null : Number(it.low_stock_threshold);
    return {
      ...it,
      onHand,
      low: threshold !== null && onHand < threshold,
      received: p ? Number(p.received) : 0,
      yielded: p ? Number(p.yielded) : 0,
      heldQc: p ? Number(p.held_qc) : 0,
      heldStability: p ? Number(p.held_stability) : 0,
      heldRnd: p ? Number(p.held_rnd) : 0,
      consumedByFp: p ? Number(p.consumed_by_fp) : 0,
      issuedPackaging: p ? Number(p.issued_packaging) : 0,
      wastage: p ? Number(p.wastage) : 0,
    };
  });

  return (
    <Card>
      {(itemsError || positionError) && (
        <p className="p-4 text-sm text-red">{itemsError?.message ?? positionError?.message}</p>
      )}
      <StockPositionTable rows={rows} />
    </Card>
  );
}

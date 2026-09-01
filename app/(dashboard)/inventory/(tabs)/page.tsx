import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { InventoryLedgerTable, type LedgerRow } from "./inventory-ledger-table";

const LEDGER_LIMIT = 1000;

type LedgerQueryRow = Omit<LedgerRow, "eventByName" | "fpBatchNumber">;

export default async function InventoryLedgerPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_ledger")
    .select(
      "id, event_at, event_type, quantity, unit, department, reference_type, reference_id, event_by, items(name, item_code), purchase_lines(batch_number)"
    )
    .order("event_at", { ascending: false })
    .limit(LEDGER_LIMIT)
    .returns<LedgerQueryRow[]>();

  const ledgerRows = data ?? [];

  // event_by references auth.users, not profiles directly, so there is no
  // FK PostgREST can embed — fetch the display names in a second query and
  // merge server-side. Falls back to a shortened user id when a profile
  // (or full_name on it) is missing, rather than dropping the column.
  const userIds = Array.from(new Set(ledgerRows.map((r) => r.event_by).filter((v): v is string => !!v)));
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    (profiles ?? []).forEach((p) => {
      if (p.full_name) nameById.set(p.id, p.full_name);
    });
  }

  // FB-0013 ("Batch should be visible in inventory ledger"): purchase_lines
  // above only covers raw-material batches. A 'finished_product' pull
  // (MFR component consumption) or a 'packaging' pull has no
  // purchase_line_id at all — its batch context is the *Finished Product*
  // batch instead, reachable only via the untyped reference_id column (no
  // real FK PostgREST can embed — see known-issues.md). Resolve it with two
  // more targeted lookups rather than a schema change: 'finished_product'
  // rows point straight at finished_product_batches.id; 'packaging' rows
  // point at packaging_issues.id, one hop further to the batch.
  const fpBatchByLedgerId = new Map<string, string>();
  const fpDirectIds = ledgerRows
    .filter((r) => r.reference_type === "finished_product" && r.reference_id)
    .map((r) => r.reference_id as string);
  const packagingIds = ledgerRows
    .filter((r) => r.reference_type === "packaging" && r.reference_id)
    .map((r) => r.reference_id as string);

  const [fpDirect, fpViaPackaging] = await Promise.all([
    fpDirectIds.length > 0
      ? supabase.from("finished_product_batches").select("id, batch_number").in("id", fpDirectIds)
      : Promise.resolve({ data: [] }),
    packagingIds.length > 0
      ? supabase
          .from("packaging_issues")
          .select("id, finished_product_batches(batch_number)")
          .in("id", packagingIds)
      : Promise.resolve({ data: [] }),
  ]);
  (fpDirect.data ?? []).forEach((b: { id: string; batch_number: string }) => {
    fpBatchByLedgerId.set(b.id, b.batch_number);
  });
  (fpViaPackaging.data ?? []).forEach((p) => {
    const row = p as unknown as { id: string; finished_product_batches: { batch_number: string } | null };
    if (row.finished_product_batches) fpBatchByLedgerId.set(row.id, row.finished_product_batches.batch_number);
  });

  const rows: LedgerRow[] = ledgerRows.map((r) => ({
    ...r,
    eventByName: r.event_by ? nameById.get(r.event_by) ?? r.event_by.slice(0, 8) : null,
    fpBatchNumber: r.reference_id ? fpBatchByLedgerId.get(r.reference_id) ?? null : null,
  }));

  return (
    <Card>
      {error && <p className="p-4 text-sm text-red">{error.message}</p>}
      <InventoryLedgerTable rows={rows} ledgerLimit={LEDGER_LIMIT} />
    </Card>
  );
}

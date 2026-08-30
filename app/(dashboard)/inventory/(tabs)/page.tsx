import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { InventoryLedgerTable, type LedgerRow } from "./inventory-ledger-table";

const LEDGER_LIMIT = 1000;

type LedgerQueryRow = Omit<LedgerRow, "eventByName">;

export default async function InventoryLedgerPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_ledger")
    .select(
      "id, event_at, event_type, quantity, unit, department, reference_type, event_by, items(name, item_code), purchase_lines(batch_number)"
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

  const rows: LedgerRow[] = ledgerRows.map((r) => ({
    ...r,
    eventByName: r.event_by ? nameById.get(r.event_by) ?? r.event_by.slice(0, 8) : null,
  }));

  return (
    <Card>
      {error && <p className="p-4 text-sm text-red">{error.message}</p>}
      <InventoryLedgerTable rows={rows} ledgerLimit={LEDGER_LIMIT} />
    </Card>
  );
}

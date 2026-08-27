import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatNumber } from "@/lib/utils";

const LEDGER_LIMIT = 1000;

type LedgerRow = {
  id: string;
  event_at: string;
  event_type: string;
  quantity: string | number;
  unit: string | null;
  department: string | null;
  reference_type: string | null;
  event_by: string | null;
  items: { name: string; item_code: string } | null;
  purchase_lines: { batch_number: string } | null;
};

function formatEventAt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function InventoryLedgerPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_ledger")
    .select(
      "id, event_at, event_type, quantity, unit, department, reference_type, event_by, items(name, item_code), purchase_lines(batch_number)"
    )
    .order("event_at", { ascending: false })
    .limit(LEDGER_LIMIT)
    .returns<LedgerRow[]>();

  const rows = data ?? [];

  // event_by references auth.users, not profiles directly, so there is no
  // FK PostgREST can embed — fetch the display names in a second query and
  // merge client-side. Falls back to a shortened user id when a profile
  // (or full_name on it) is missing, rather than dropping the column.
  const userIds = Array.from(new Set(rows.map((r) => r.event_by).filter((v): v is string => !!v)));
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

  const columns: Column<LedgerRow>[] = [
    {
      header: "Date / time",
      accessor: (r) => <span className="whitespace-nowrap">{formatEventAt(r.event_at)}</span>,
      sortValue: (r) => r.event_at,
    },
    {
      header: "Event",
      accessor: (r) => <Badge status={r.event_type}>{r.event_type}</Badge>,
      searchValue: (r) => r.event_type,
    },
    {
      header: "Item",
      accessor: (r) => (
        <div>
          <div className="font-medium">
            {r.items?.name ?? "—"}{" "}
            <span className="text-xs font-normal text-muted">{r.items?.item_code}</span>
          </div>
          {r.purchase_lines?.batch_number && (
            <div className="text-xs text-muted">Batch {r.purchase_lines.batch_number}</div>
          )}
        </div>
      ),
      searchValue: (r) =>
        `${r.items?.name ?? ""} ${r.items?.item_code ?? ""} ${r.purchase_lines?.batch_number ?? ""}`,
    },
    {
      header: "Quantity",
      accessor: (r) => (
        <span className="whitespace-nowrap">
          {formatNumber(r.quantity)} {r.unit}
        </span>
      ),
    },
    {
      header: "Department",
      accessor: (r) => (r.department ? <span className="capitalize">{r.department}</span> : "—"),
    },
    {
      header: "Reference",
      accessor: (r) => (r.reference_type ? <span className="capitalize">{r.reference_type}</span> : "—"),
      searchValue: (r) => r.reference_type ?? "",
    },
    {
      header: "By",
      accessor: (r) => (r.event_by ? nameById.get(r.event_by) ?? r.event_by.slice(0, 8) : "—"),
    },
  ];

  return (
    <Card>
      {error && <p className="p-4 text-sm text-red">{error.message}</p>}
      <DataTable
        columns={columns}
        rows={rows}
        searchPlaceholder="Search item, batch, event type, reference…"
        emptyLabel="No ledger events yet."
        pageSize={20}
      />
      {rows.length === LEDGER_LIMIT && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          Showing the most recent {LEDGER_LIMIT.toLocaleString("en-IN")} events.
        </p>
      )}
    </Card>
  );
}

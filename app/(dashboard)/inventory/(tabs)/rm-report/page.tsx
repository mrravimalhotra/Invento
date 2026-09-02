import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import { RmReportFilter } from "./rm-report-filter";
import { RmReportExport, type RmReportExportRow } from "./rm-report-export";
import { RmReportTable } from "./rm-report-table";

type PurchaseLineRow = {
  id: string;
  batch_number: string;
  quantity: string | number;
  qc_qty: string | number;
  stability_qty: string | number;
  rnd_qty: string | number;
  remaining_qty: string | number;
  unit: string;
  unit_price: string | number | null;
  expiry_date: string | null;
  created_at: string;
  items: { name: string; item_code: string } | null;
  purchase_orders: { status: string } | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default async function RmReportPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { asOf: asOfParam } = await searchParams;
  const asOf = asOfParam && /^\d{4}-\d{2}-\d{2}$/.test(asOfParam) ? asOfParam : todayIso();

  const supabase = await createClient();
  // FB-0018: a draft (not yet Final Submitted) line's remaining_qty has
  // never actually reached stock (0019_purchase_submit_workflow.sql) — an
  // "as of" stock report would overstate what's really on hand if it
  // included those, so this is filtered to submitted purchase orders only.
  const { data, error } = await supabase
    .from("purchase_lines")
    .select(
      "id, batch_number, quantity, qc_qty, stability_qty, rnd_qty, remaining_qty, unit, unit_price, expiry_date, created_at, items(name, item_code), purchase_orders!inner(status)"
    )
    .eq("active", true)
    .eq("purchase_orders.status", "submitted")
    .lte("created_at", `${asOf}T23:59:59.999`)
    .order("created_at", { ascending: false })
    .returns<PurchaseLineRow[]>();

  const rows: RmReportExportRow[] = (data ?? []).map((r) => {
    const pqty = Number(r.quantity);
    const sqty = Number(r.qc_qty) + Number(r.stability_qty) + Number(r.rnd_qty);
    const qty = Number(r.remaining_qty);
    const unitPrice = r.unit_price === null ? 0 : Number(r.unit_price);
    return {
      item: `${r.items?.name ?? "—"} (${r.items?.item_code ?? "—"}) — Batch ${r.batch_number}`,
      batchNumber: r.batch_number,
      pqty,
      sqty,
      qty,
      unit: r.unit,
      unitPrice,
      total: qty * unitPrice,
    };
  });

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <RmReportFilter asOf={asOf} />
        <div className="p-4">
          <RmReportExport asOf={asOf} rows={rows} />
        </div>
      </div>
      {error && <p className="p-4 text-sm text-red">{error.message}</p>}
      <RmReportTable rows={rows} asOf={asOf} />
      {rows.length > 0 && (
        <div className="flex justify-end border-t border-border px-4 py-2.5 text-sm font-semibold">
          Grand total: {formatNumber(grandTotal)}
        </div>
      )}
    </Card>
  );
}

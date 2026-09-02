import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import { computeBatchQcState } from "@/lib/batch-qc-status";
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
  // Phase 2 (claude/inventory-ledger-redesign.md Gap 2) — live, not the
  // static generated remaining_qty: this report's QTY column is meant to
  // be "what's actually left in this batch right now," so it needs to be
  // net of Finished Product consumption and batch-tied wastage too, not
  // just QC/Stability/R&D sampling at receipt.
  live_remaining_qty: string | number;
  unit: string;
  unit_price: string | number | null;
  expiry_date: string | null;
  created_at: string;
  items: { name: string; item_code: string; category: string } | null;
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
  //
  // items!inner(..., category) + .eq("items.category", "raw") (3 Sept
  // 2026, found while adding the QC Status column below): this report was
  // never actually filtered to raw material despite its name — a
  // Packaging Item purchase line (added Seventh pass, Task F) would have
  // shown up here too. Harmless before QC Status existed (packaging just
  // sat there with no QC-related column to be wrong), but with a QC
  // Status column now added it would have shown every packaging batch as
  // permanently "QC Pending," which is actively misleading — packaging
  // never goes through QC in this app, same reasoning already applied to
  // the QC/Labels/FP-compose pickers.
  const { data, error } = await supabase
    .from("purchase_lines")
    .select(
      "id, batch_number, quantity, qc_qty, stability_qty, rnd_qty, remaining_qty, live_remaining_qty, unit, unit_price, expiry_date, created_at, items!inner(name, item_code, category), purchase_orders!inner(status)"
    )
    .eq("active", true)
    .eq("purchase_orders.status", "submitted")
    .eq("items.category", "raw")
    .lte("created_at", `${asOf}T23:59:59.999`)
    .order("created_at", { ascending: false })
    .returns<PurchaseLineRow[]>();

  // QC Status column (3 Sept 2026): purchase_batch_status is a view
  // PostgREST can't embed through directly (no declared FK), same
  // two-step lookup pattern used everywhere else in this app that needs
  // it (qc/new/page.tsx, qc/page.tsx's Awaiting QC / Due for retest
  // cards). See lib/batch-qc-status.ts for the qc_status + retest_date ->
  // display-state mapping.
  const lineIds = (data ?? []).map((r) => r.id);
  const { data: statusRows } = lineIds.length
    ? await supabase.from("purchase_batch_status").select("purchase_line_id, qc_status, retest_date").in("purchase_line_id", lineIds)
    : { data: [] as { purchase_line_id: string; qc_status: string; retest_date: string | null }[] };
  const statusByLine = new Map((statusRows ?? []).map((s) => [s.purchase_line_id, s]));

  const rows: RmReportExportRow[] = (data ?? []).map((r) => {
    const pqty = Number(r.quantity);
    const sqty = Number(r.qc_qty) + Number(r.stability_qty) + Number(r.rnd_qty);
    const qty = Number(r.live_remaining_qty);
    const unitPrice = r.unit_price === null ? 0 : Number(r.unit_price);
    const status = statusByLine.get(r.id);
    return {
      item: `${r.items?.name ?? "—"} (${r.items?.item_code ?? "—"}) — Batch ${r.batch_number}`,
      batchNumber: r.batch_number,
      pqty,
      sqty,
      qty,
      unit: r.unit,
      unitPrice,
      total: qty * unitPrice,
      qcState: computeBatchQcState(status?.qc_status, status?.retest_date),
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

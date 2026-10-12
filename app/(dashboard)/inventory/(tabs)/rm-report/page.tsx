import { roundMoney, sumMoney } from "@/lib/money";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { formatNumber, todayIst, formatDate } from "@/lib/utils";
import { computeBatchQcState } from "@/lib/batch-qc-status";
import { RmReportExport, type RmReportExportRow } from "./rm-report-export";
import { RmReportTable } from "./rm-report-table";

import { friendlyDbError } from "@/lib/db-errors";
import { LoadWarning } from "@/components/ui/load-warning";
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
  is_legacy: boolean;
  items: { name: string; item_code: string; category: string } | null;
  purchase_orders: { status: string } | null;
};

function todayIso() {
  return todayIst();
}

// SCAN-P3-11 (Ravi, 11 Oct 2026): this report shows CURRENT stock only. The quantity column
// is the quantity left today, so a date picker made it look like past stock; the date
// picker is gone and the Stock Statement (Inventory) gives true figures for a past date.
export default async function RmReportPage() {
  const asOf = todayIso();

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
  // ACC-08 (29 Sept 2026): paged with fetchAllRows — a plain select stops at
  // Supabase's 1,000-row cap, so the report and its Grand Total silently
  // covered only the newest 1,000 batches.
  const { data, error } = await fetchAllRows<PurchaseLineRow>((from, to) =>
    supabase
      .from("purchase_lines")
      .select(
        "id, batch_number, quantity, qc_qty, stability_qty, rnd_qty, remaining_qty, live_remaining_qty, unit, unit_price, expiry_date, created_at, is_legacy, items!inner(name, item_code, category), purchase_orders!inner(status)"
      )
      .eq("active", true)
      .eq("purchase_orders.status", "submitted")
      .eq("items.category", "raw")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
      .returns<PurchaseLineRow[]>()
  );

  // QC Status column (3 Sept 2026): purchase_batch_status is a view
  // PostgREST can't embed through directly (no declared FK), same
  // two-step lookup pattern used everywhere else in this app that needs
  // it (qc/new/page.tsx, qc/page.tsx's Awaiting QC / Due for retest
  // cards). See lib/batch-qc-status.ts for the qc_status + retest_date ->
  // display-state mapping.
  const lineIds = (data ?? []).map((r) => r.id);
  // ACC-08: fetched in chunks — thousands of ids in one request is too long
  // a URL, and a failed lookup showed every batch as "QC Pending".
  const { data: statusRows, error: statusError } = await fetchByIdChunks<{ purchase_line_id: string; qc_status: string; retest_date: string | null; expiry_date: string | null }>(
    lineIds,
    (chunk) => supabase.from("purchase_batch_status").select("purchase_line_id, qc_status, retest_date, expiry_date").in("purchase_line_id", chunk)
  );
  const statusByLine = new Map((statusRows ?? []).map((s) => [s.purchase_line_id, s]));

  // Raw material made through Production issues is stock of raw items too (it is in On hand
  // on Stock Position), so it is listed here as well; it has no purchase price.
  const { data: prodBatches, error: prodError } = await fetchAllRows<{
    id: string; batch_number: string; quantity: string | number; live_remaining_qty: string | number; unit: string;
    items: { name: string; item_code: string } | null;
  }>((from, to) =>
    supabase
      .from("production_issue_batches")
      .select("id, batch_number, quantity, live_remaining_qty, unit, items!inner(name, item_code)")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
      .returns<{
        id: string; batch_number: string; quantity: string | number; live_remaining_qty: string | number; unit: string;
        items: { name: string; item_code: string } | null;
      }[]>()
  );
  const { data: prodStatusRows, error: prodStatusError } = await fetchByIdChunks<{ production_batch_id: string; qc_status: string; retest_date: string | null; expiry_date: string | null }>(
    (prodBatches ?? []).map((b) => b.id),
    (chunk) => supabase.from("production_batch_status").select("production_batch_id, qc_status, retest_date, expiry_date").in("production_batch_id", chunk)
  );
  const prodStatusById = new Map((prodStatusRows ?? []).map((x) => [x.production_batch_id, x]));

  const purchaseRows: RmReportExportRow[] = (data ?? []).map((r) => {
    const pqty = Number(r.quantity);
    const sqty = Number(r.qc_qty) + Number(r.stability_qty) + Number(r.rnd_qty);
    const qty = Number(r.live_remaining_qty);
    // A missing price is shown as "No price" and left out of the total (it used to count as 0).
    const unitPrice = r.unit_price === null ? null : Number(r.unit_price);
    const status = statusByLine.get(r.id);
    return {
      item: `${r.items?.name ?? "—"} (${r.items?.item_code ?? "—"}) — Batch ${r.batch_number}`,
      batchNumber: r.batch_number,
      isLegacy: r.is_legacy,
      pqty,
      sqty,
      qty,
      unit: r.unit,
      unitPrice,
      total: unitPrice === null ? null : roundMoney(qty * unitPrice),
      qcState: computeBatchQcState(status?.qc_status, status?.retest_date, undefined, status?.expiry_date),
    };
  });
  const productionRows: RmReportExportRow[] = (prodBatches ?? []).map((b) => {
    const status = prodStatusById.get(b.id);
    return {
      item: `${b.items?.name ?? "—"} (${b.items?.item_code ?? "—"}) — Batch ${b.batch_number} (Production)`,
      batchNumber: b.batch_number,
      isLegacy: false,
      pqty: Number(b.quantity),
      sqty: 0,
      qty: Number(b.live_remaining_qty),
      unit: b.unit,
      unitPrice: null,
      total: null,
      qcState: computeBatchQcState(status?.qc_status, status?.retest_date, undefined, status?.expiry_date),
    };
  });
  // A batch QC rejected is out of On hand (0104); it is listed under Rejected Materials.
  const rows = [...purchaseRows, ...productionRows].filter((r) => r.qcState !== "rejected");

  const grandTotal = sumMoney(rows.map((r) => r.total ?? 0));
  const unpriced = rows.filter((r) => r.total === null && r.qty > 0).length;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <p className="max-w-2xl text-sm text-muted">
          Current stock of each raw material batch, as of today ({formatDate(asOf)}). Rejected batches are not listed
          (see Rejected Materials). For stock on a past date use the Stock Statement.
          PQTY is the quantity purchased, SQTY the samples taken (QC, stability and R&amp;D) and QTY the stock left.
        </p>
        <div>
          <RmReportExport asOf={asOf} rows={rows} />
        </div>
      </div>
      {(error || prodError) && <p className="p-4 text-sm text-red">{friendlyDbError((error ?? prodError)!, "Couldn't load this list.")}</p>}
      <div className="px-4 pt-4"><LoadWarning errors={[statusError, prodStatusError]} what="the QC status of the batches" /></div>
      <RmReportTable rows={rows} asOf={asOf} />
      {rows.length > 0 && (
        <div className="flex justify-end border-t border-border px-4 py-2.5 text-sm font-semibold">
          Grand total: {formatNumber(grandTotal)}
          {unpriced > 0 && (
            <span className="ml-2 font-normal text-muted">
              ({unpriced} batch{unpriced === 1 ? " has" : "es have"} no price and {unpriced === 1 ? "is" : "are"} not valued)
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

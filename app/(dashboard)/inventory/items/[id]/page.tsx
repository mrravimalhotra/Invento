import { notFound } from "next/navigation";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { ItemPositionSummary, type Position } from "./item-position-summary";
import { PurchaseBatchesTable, type PurchaseBatchRow } from "./purchase-batches-table";
import { ProductionBatchesTable, type ProductionBatchRow } from "./production-batches-table";
import { FpBatchesTable, type FpBatchRow } from "./fp-batches-table";
import { InventoryLedgerTable, type LedgerRow } from "@/app/(dashboard)/inventory/(tabs)/inventory-ledger-table";
import { enrichLedgerRows, type RawLedgerRow } from "@/lib/ledger-enrich";
import { splitRmStock, type RmBatchStock, type RmStockSplit } from "@/lib/usable-stock";
import { todayIst } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  raw: "Raw material",
  processed: "Finished product",
  packaging: "Packaging",
  packaged_fp: "Packaged finished product",
};

const ITEM_LEDGER_LIMIT = 500;

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
  low_stock_threshold: string | number | null;
  category: string;
};

// item_position (0031_stock_position.sql) — same view the Stock Position
// table reads, here scoped to a single item via .eq("item_id", id).
type PositionQueryRow = {
  received: string | number;
  yielded: string | number;
  held_qc: string | number;
  held_stability: string | number;
  held_rnd: string | number;
  consumed_by_fp: string | number;
  issued_packaging: string | number;
  consumed_by_packaging: string | number;
  packaged_yield: string | number;
  issued_store: string | number;
  issued_rnd: string | number;
  wastage: string | number;
  production_rm_yield: string | number;
  on_hand: string | number;
};

type PurchaseLineQueryRow = {
  id: string;
  batch_number: string;
  quantity: string | number;
  qc_qty: string | number;
  stability_qty: string | number;
  rnd_qty: string | number;
  live_remaining_qty: string | number;
  unit: string;
  expiry_date: string | null;
  created_at: string;
  pushed_at: string | null;
  purchase_orders: { status: string } | null;
};

type FpBatchQueryRow = {
  id: string;
  batch_number: string;
  short_batch_no: string | null;
  status: string;
  batch_yield: string | number | null;
  qc_sample_qty: string | number | null;
  stability_qty: string | number | null;
  rnd_qty: string | number | null;
  finish_date: string | null;
};

export default async function ItemPositionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: item }, { data: position }] = await Promise.all([
    supabase
      .from("items")
      .select("id, item_code, name, unit, low_stock_threshold, category")
      .eq("id", id)
      .maybeSingle<ItemRow>(),
    supabase
      .from("item_position")
      .select(
        "received, yielded, held_qc, held_stability, held_rnd, consumed_by_fp, issued_packaging, consumed_by_packaging, packaged_yield, issued_store, issued_rnd, wastage, production_rm_yield, on_hand"
      )
      .eq("item_id", id)
      .maybeSingle<PositionQueryRow>(),
  ]);

  if (!item) notFound();

  const p = position;
  const positionData: Position = {
    received: p ? Number(p.received) : 0,
    yielded: p ? Number(p.yielded) : 0,
    heldQc: p ? Number(p.held_qc) : 0,
    heldStability: p ? Number(p.held_stability) : 0,
    heldRnd: p ? Number(p.held_rnd) : 0,
    consumedByFp: p ? Number(p.consumed_by_fp) : 0,
    issuedPackaging: p ? Number(p.issued_packaging) : 0,
    consumedByPackaging: p ? Number(p.consumed_by_packaging) : 0,
    packagedYield: p ? Number(p.packaged_yield) : 0,
    issuedStore: p ? Number(p.issued_store) : 0,
    issuedRnd: p ? Number(p.issued_rnd) : 0,
    wastage: p ? Number(p.wastage) : 0,
    productionRmYield: p ? Number(p.production_rm_yield) : 0,
    onHand: p ? Number(p.on_hand) : 0,
  };

  // Category-conditional batch list. Raw material and Packaging items are
  // backed by purchase_lines (the same "Received / Remaining now" batch
  // shape as the RM Report — Phase 2); Finished Product items are backed
  // by finished_product_batches, reached via
  // mfr_definitions.finished_product_item_id (Phase 3's own linkage —
  // 0010_mfr_finished_product_link.sql).
  let purchaseBatches: PurchaseBatchRow[] = [];
  let productionBatches: ProductionBatchRow[] = [];
  let fpBatches: FpBatchRow[] = [];
  // ACC-22: raw-material stock production can actually use (see lib/usable-stock.ts).
  let rmStock: RmStockSplit | undefined;

  if (item.category === "raw" || item.category === "packaging") {
    // ACC-22: paged (fetchAllRows) so the usable-stock total below can't be
    // cut short by the 1,000-row cap; ordered by a unique tiebreak (ACC-07).
    const { data: lines } = await fetchAllRows<PurchaseLineQueryRow>((from, to) =>
      supabase
        .from("purchase_lines")
        .select(
          "id, batch_number, quantity, qc_qty, stability_qty, rnd_qty, live_remaining_qty, unit, expiry_date, created_at, pushed_at, purchase_orders!inner(status)"
        )
        .eq("item_id", id)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<PurchaseLineQueryRow[]>()
    );

    const lineRows = lines;
    const lineIds = lineRows.map((r) => r.id);
    // ACC-08: looked up in chunks (see fetchByIdChunks).
    const { data: statusRows } = await fetchByIdChunks<{ purchase_line_id: string; qc_status: string; retest_date: string | null }>(
      item.category === "raw" ? lineIds : [],
      (chunk) => supabase.from("purchase_batch_status").select("purchase_line_id, qc_status, retest_date").in("purchase_line_id", chunk)
    );
    const statusByLine = new Map((statusRows ?? []).map((s) => [s.purchase_line_id, s]));

    purchaseBatches = lineRows.map((r) => {
      const status = statusByLine.get(r.id);
      return {
        id: r.id,
        batch_number: r.batch_number,
        quantity: r.quantity,
        qc_qty: r.qc_qty,
        stability_qty: r.stability_qty,
        rnd_qty: r.rnd_qty,
        live_remaining_qty: r.live_remaining_qty,
        unit: r.unit,
        expiry_date: r.expiry_date,
        created_at: r.created_at,
        purchase_order_status: r.purchase_orders?.status ?? "submitted",
        qc_status: status?.qc_status ?? null,
        retest_date: status?.retest_date ?? null,
      };
    });

    // Production-sourced Raw Material batches (19 Sept 2026 — "Packaging
    // issued to Production"): a Raw Material item created this way (e.g.
    // RM-FP-00001) is never purchased, so purchaseBatches above is always
    // empty for it — its batches live in production_issue_batches instead.
    // Only 'raw' items can ever be paired via production_rm_item_id
    // (0050_production_rm_from_packaging.sql), so this is skipped for
    // Packaging items.
    if (item.category === "raw") {
      // FB-0043: QC status/retest date are read via production_batch_status
      // (0068_production_rm_full_qc.sql) — a plain view PostgREST can't
      // embed through directly, so fetched separately and merged in JS,
      // same two-step shape qc/page.tsx already uses for the analogous
      // purchase_batch_status lookups.
      const { data: prodBatches } = await fetchAllRows<ProductionBatchRow>((from, to) =>
        supabase
          .from("production_issue_batches")
          .select(
            "id, batch_number, quantity, live_remaining_qty, unit, qc_qty, stability_qty, rnd_qty, created_at, packaging_issues(code, created_at)"
          )
          .eq("item_id", id)
          .eq("active", true)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
          .returns<ProductionBatchRow[]>()
      );
      // ACC-08: status only for this item's batches — the whole view was read
      // in one request before, capped at 1,000 rows.
      const { data: prodStatuses } = await fetchByIdChunks<{ production_batch_id: string; qc_status: string; retest_date: string | null }>(
        prodBatches.map((b) => b.id),
        (chunk) =>
          supabase.from("production_batch_status").select("production_batch_id, qc_status, retest_date").in("production_batch_id", chunk)
      );
      const statusByBatch = new Map((prodStatuses ?? []).map((s) => [s.production_batch_id, s]));
      productionBatches = prodBatches.map((b) => ({
        ...b,
        qc_status: statusByBatch.get(b.id)?.qc_status ?? null,
        retest_date: statusByBatch.get(b.id)?.retest_date ?? null,
      }));
    }

    if (item.category === "raw") {
      // Purchased batches count only while their purchase order is submitted
      // (a reopened one is not in stock); production-sourced batches have no
      // purchase order. Same rule as Compose and the database QC gate.
      const today = todayIst();
      const stock: RmBatchStock[] = [
        ...lineRows.map((r) => {
          const st = statusByLine.get(r.id);
          return {
            liveRemaining: Number(r.live_remaining_qty),
            qcStatus: st?.qc_status ?? null,
            retestDate: st?.retest_date ?? null,
            inStock: r.pushed_at !== null,
          };
        }),
        ...productionBatches.map((b) => ({
          liveRemaining: Number(b.live_remaining_qty),
          qcStatus: b.qc_status ?? null,
          retestDate: b.retest_date ?? null,
          inStock: true,
        })),
      ];
      rmStock = splitRmStock(stock, today);
    }
  } else if (item.category === "processed") {
    const { data: mfrDef } = await supabase
      .from("mfr_definitions")
      .select("id")
      .eq("finished_product_item_id", id)
      .maybeSingle<{ id: string }>();

    if (mfrDef) {
      const { data: batches } = await supabase
        .from("finished_product_batches")
        .select(
          "id, batch_number, short_batch_no, status, batch_yield, qc_sample_qty, stability_qty, rnd_qty, finish_date",
        )
        .eq("mfr_definition_id", mfrDef.id)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .returns<FpBatchQueryRow[]>();
      fpBatches = batches ?? [];
    }
  }

  // Embedded ledger for this item — same inventory_ledger_with_balance
  // view + enrichLedgerRows helper the Ledger tab uses, filtered to this
  // item and capped like every other unbounded ledger query in this app.
  // Secondary `seq` sort (14 Sept 2026, descending — see the Ledger tab's
  // own query for the full writeup) matches the same fix there: a
  // Purchase push and its QC/Stability/R&D sample pulls all share one
  // event_at (submit_purchase_order() writes them in the same
  // transaction), so without a tiebreaker their display order was
  // unspecified. Descending (not ascending) keeps same-instant rows
  // consistent with the page's overall newest-first convention — the
  // most-recently-written row of a tied group (R&D, written last) shows
  // first, then Stability, then QC, then Purchase.
  const { data: ledgerData } = await supabase
    .from("inventory_ledger_with_balance")
    .select(
      "id, event_at, event_type, quantity, unit, department, reference_type, reference_id, event_by, running_balance, items(name, item_code), purchase_lines(batch_number), production_issue_batches(batch_number)"
    )
    .eq("item_id", id)
    .order("event_at", { ascending: false })
    .order("seq", { ascending: false })
    .limit(ITEM_LEDGER_LIMIT)
    .returns<RawLedgerRow[]>();

  const ledgerRows: LedgerRow[] = await enrichLedgerRows(supabase, ledgerData ?? []);

  return (
    <div>
      <p className="mb-2">
        <Link href="/inventory/balance" className="text-sm text-brand hover:underline">
          ← Stock Position
        </Link>
      </p>
      <PageHeader
        title={item.name}
        description={`${item.item_code} · ${CATEGORY_LABELS[item.category] ?? item.category}`}
      />

      <Card className="mb-6">
        <CardHeader title="Position" />
        <CardBody>
          <ItemPositionSummary category={item.category} unit={item.unit} position={positionData} rmStock={rmStock} />
        </CardBody>
      </Card>

      {(item.category === "raw" || item.category === "packaging") && (
        <Card className="mb-6">
          <CardHeader title="Purchase batches" />
          <PurchaseBatchesTable rows={purchaseBatches} showQcStatus={item.category === "raw"} />
        </Card>
      )}

      {productionBatches.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Production batches" />
          <ProductionBatchesTable rows={productionBatches} itemName={item.name} itemCode={item.item_code} />
        </Card>
      )}

      {item.category === "processed" && (
        <Card className="mb-6">
          <CardHeader title="Finished Product batches" />
          <FpBatchesTable rows={fpBatches} unit={item.unit} />
        </Card>
      )}

      <Card>
        <CardHeader title="Ledger" />
        <InventoryLedgerTable rows={ledgerRows} ledgerLimit={ITEM_LEDGER_LIMIT} />
      </Card>
    </div>
  );
}

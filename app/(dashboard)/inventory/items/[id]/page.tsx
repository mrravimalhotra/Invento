import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { ItemPositionSummary, type Position } from "./item-position-summary";
import { PurchaseBatchesTable, type PurchaseBatchRow } from "./purchase-batches-table";
import { FpBatchesTable, type FpBatchRow } from "./fp-batches-table";
import { InventoryLedgerTable, type LedgerRow } from "@/app/(dashboard)/inventory/(tabs)/inventory-ledger-table";
import { enrichLedgerRows, type RawLedgerRow } from "@/lib/ledger-enrich";

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
  purchase_orders: { status: string } | null;
};

type FpBatchQueryRow = {
  id: string;
  batch_number: string;
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
        "received, yielded, held_qc, held_stability, held_rnd, consumed_by_fp, issued_packaging, consumed_by_packaging, packaged_yield, issued_store, issued_rnd, wastage, on_hand"
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
    onHand: p ? Number(p.on_hand) : 0,
  };

  // Category-conditional batch list. Raw material and Packaging items are
  // backed by purchase_lines (the same "Received / Remaining now" batch
  // shape as the RM Report — Phase 2); Finished Product items are backed
  // by finished_product_batches, reached via
  // mfr_definitions.finished_product_item_id (Phase 3's own linkage —
  // 0010_mfr_finished_product_link.sql).
  let purchaseBatches: PurchaseBatchRow[] = [];
  let fpBatches: FpBatchRow[] = [];

  if (item.category === "raw" || item.category === "packaging") {
    const { data: lines } = await supabase
      .from("purchase_lines")
      .select(
        "id, batch_number, quantity, qc_qty, stability_qty, rnd_qty, live_remaining_qty, unit, expiry_date, created_at, purchase_orders!inner(status)"
      )
      .eq("item_id", id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .returns<PurchaseLineQueryRow[]>();

    const lineRows = lines ?? [];
    const lineIds = lineRows.map((r) => r.id);
    const { data: statusRows } =
      item.category === "raw" && lineIds.length > 0
        ? await supabase
            .from("purchase_batch_status")
            .select("purchase_line_id, qc_status, retest_date")
            .in("purchase_line_id", lineIds)
        : { data: [] as { purchase_line_id: string; qc_status: string; retest_date: string | null }[] };
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
  } else if (item.category === "processed") {
    const { data: mfrDef } = await supabase
      .from("mfr_definitions")
      .select("id")
      .eq("finished_product_item_id", id)
      .maybeSingle<{ id: string }>();

    if (mfrDef) {
      const { data: batches } = await supabase
        .from("finished_product_batches")
        .select("id, batch_number, status, batch_yield, qc_sample_qty, stability_qty, rnd_qty, finish_date")
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
  const { data: ledgerData } = await supabase
    .from("inventory_ledger_with_balance")
    .select(
      "id, event_at, event_type, quantity, unit, department, reference_type, reference_id, event_by, running_balance, items(name, item_code), purchase_lines(batch_number)"
    )
    .eq("item_id", id)
    .order("event_at", { ascending: false })
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
          <ItemPositionSummary category={item.category} unit={item.unit} position={positionData} />
        </CardBody>
      </Card>

      {(item.category === "raw" || item.category === "packaging") && (
        <Card className="mb-6">
          <CardHeader title="Purchase batches" />
          <PurchaseBatchesTable rows={purchaseBatches} showQcStatus={item.category === "raw"} />
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

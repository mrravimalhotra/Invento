import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { fpBatchBoth } from "@/lib/utils";
import { RejectedTable, type RejectedRow } from "./rejected-table";

// Rejected Materials (0104, Ravi 4 Oct 2026): every batch QC has rejected —
// raw material (bought or made from a production issue) and finished product —
// with the samples already taken from it. List only. Rejected raw material is
// no longer counted in On hand (the QC decision moves it out through the
// ledger); finished product never entered the ledger, so its held quantity is
// the batch yield less the samples.

type RmRow = {
  source: "purchase" | "production";
  batch_id: string;
  item_id: string;
  batch_number: string;
  received_qty: string | number;
  qc_qty: string | number;
  stability_qty: string | number;
  rnd_qty: string | number;
  unit: string;
  is_legacy: boolean;
  rejected_qty: string | number;
  ar_number: string | null;
  rejected_at: string | null;
};

type FpBatchRow = {
  id: string;
  batch_number: string;
  short_batch_no: string | null;
  is_legacy: boolean;
  unit: string;
  batch_yield: string | number | null;
  target_qty: string | number;
  qc_sample_qty: string | number | null;
  stability_qty: string | number | null;
  rnd_qty: string | number | null;
  finish_date: string | null;
  mfr_definitions: { name: string; finished_product_item_id: string | null } | null;
};

type ItemRow = { id: string; item_code: string; name: string };
type QcRow = { finished_product_batch_id: string; ar_number: string | null; reviewed_at: string | null; created_at: string; status: string };

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

export default async function RejectedMaterialsPage() {
  const supabase = await createClient();

  const [rm, fp] = await Promise.all([
    fetchAllRows<RmRow>((from, to) =>
      supabase
        .from("rejected_batches")
        .select("source, batch_id, item_id, batch_number, received_qty, qc_qty, stability_qty, rnd_qty, unit, is_legacy, rejected_qty, ar_number, rejected_at")
        .order("batch_id", { ascending: true })
        .range(from, to)
        .returns<RmRow[]>()
    ),
    fetchAllRows<FpBatchRow>((from, to) =>
      supabase
        .from("finished_product_batches")
        .select(
          "id, batch_number, short_batch_no, is_legacy, unit, batch_yield, target_qty, qc_sample_qty, stability_qty, rnd_qty, finish_date, mfr_definitions(name, finished_product_item_id)"
        )
        .eq("status", "rejected")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<FpBatchRow[]>()
    ),
  ]);

  const fpRows = fp.data ?? [];
  const rmRows = rm.data ?? [];

  const itemIds = Array.from(
    new Set([
      ...rmRows.map((r) => r.item_id),
      ...fpRows.map((r) => r.mfr_definitions?.finished_product_item_id).filter((v): v is string => !!v),
    ])
  );
  const [{ data: items }, { data: qcs }] = await Promise.all([
    fetchByIdChunks<ItemRow>(itemIds, (chunk) => supabase.from("items").select("id, item_code, name").in("id", chunk)),
    fetchByIdChunks<QcRow>(
      fpRows.map((r) => r.id),
      (chunk) =>
        supabase
          .from("quality_checks")
          .select("finished_product_batch_id, ar_number, reviewed_at, created_at, status")
          .in("finished_product_batch_id", chunk)
    ),
  ]);
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));

  // Latest QC record per finished product batch.
  const latestQc = new Map<string, QcRow>();
  for (const q of qcs ?? []) {
    const cur = latestQc.get(q.finished_product_batch_id);
    if (!cur || q.created_at > cur.created_at) latestQc.set(q.finished_product_batch_id, q);
  }

  const rows: RejectedRow[] = [
    ...rmRows.map((r): RejectedRow => {
      const it = itemById.get(r.item_id);
      return {
        key: `${r.source}-${r.batch_id}`,
        kind: r.source === "purchase" ? "raw" : "production_raw",
        itemId: r.item_id,
        itemCode: it?.item_code ?? "—",
        itemName: it?.name ?? "—",
        batch: r.batch_number,
        isLegacy: r.is_legacy,
        arNumber: r.ar_number,
        rejectedAt: r.rejected_at,
        totalQty: n(r.received_qty),
        qcQty: n(r.qc_qty),
        stabilityQty: n(r.stability_qty),
        rndQty: n(r.rnd_qty),
        heldQty: n(r.rejected_qty),
        unit: r.unit,
      };
    }),
    ...fpRows.map((r): RejectedRow => {
      const itemId = r.mfr_definitions?.finished_product_item_id ?? null;
      const it = itemId ? itemById.get(itemId) : undefined;
      const total = r.batch_yield !== null ? n(r.batch_yield) : n(r.target_qty);
      const qc = n(r.qc_sample_qty);
      const st = n(r.stability_qty);
      const rd = n(r.rnd_qty);
      const q = latestQc.get(r.id);
      return {
        key: `fp-${r.id}`,
        kind: "finished",
        itemId,
        itemCode: it?.item_code ?? "—",
        itemName: it?.name ?? r.mfr_definitions?.name ?? "—",
        batch: fpBatchBoth(r.batch_number, r.short_batch_no),
        isLegacy: r.is_legacy,
        arNumber: q?.ar_number ?? null,
        rejectedAt: q?.reviewed_at ?? r.finish_date,
        totalQty: total,
        qcQty: qc,
        stabilityQty: st,
        rndQty: rd,
        heldQty: Math.max(total - qc - st - rd, 0),
        unit: r.unit,
      };
    }),
  ].sort((a, b) => (b.rejectedAt ?? "").localeCompare(a.rejectedAt ?? ""));

  const err = rm.error ?? fp.error;

  return (
    <Card>
      {err && <p className="p-4 text-sm text-red">{err.message}</p>}
      <p className="border-b border-border px-4 py-3 text-sm text-muted">
        Batches QC has rejected, with the samples taken from each. Rejected raw material is not counted in On hand.
      </p>
      <RejectedTable rows={rows} />
    </Card>
  );
}

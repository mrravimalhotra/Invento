import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { friendlyDbError } from "@/lib/db-errors";
import { SamplesTable, type SampleRow } from "./samples-table";

// Retained Samples (0108, Ravi 10 Oct 2026): the QC, Stability and R&D samples
// taken from each batch, for raw material, raw material made through
// production, and finished product. Read from the quantities set aside when
// the batch was received or completed.

type DbRow = {
  kind: "raw" | "production_raw" | "fp";
  batch_id: string;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  batch_label: string;
  unit: string | null;
  qc_qty: string | number;
  stability_qty: string | number;
  rnd_qty: string | number;
  stability_left: string | number | null;
  qc_status: string | null;
  ar_number: string | null;
  expiry_date: string | null;
  taken_at: string | null;
  is_legacy: boolean;
};

export default async function RetainedSamplesPage() {
  const supabase = await createClient();
  const res = await fetchAllRows<DbRow>(async (a, b) => {
    const r = await supabase
      .from("retained_samples")
      .select(
        "kind, batch_id, item_id, item_code, item_name, batch_label, unit, qc_qty, stability_qty, rnd_qty, stability_left, qc_status, ar_number, expiry_date, taken_at, is_legacy"
      )
      .order("taken_at", { ascending: false })
      .order("batch_id", { ascending: true })
      .range(a, b);
    return { data: r.data as unknown as DbRow[] | null, error: r.error };
  });

  const rows: SampleRow[] = (res.data ?? []).map((r) => ({
    key: `${r.kind}-${r.batch_id}`,
    kind: r.kind,
    itemId: r.item_id,
    itemCode: r.item_code ?? "—",
    itemName: r.item_name ?? "—",
    batch: r.batch_label,
    unit: r.unit ?? "",
    qc: Number(r.qc_qty),
    stability: Number(r.stability_qty),
    rnd: Number(r.rnd_qty),
    stabilityLeft: r.stability_left === null ? null : Number(r.stability_left),
    qcStatus: r.qc_status,
    arNumber: r.ar_number,
    expiryDate: r.expiry_date,
    takenAt: r.taken_at,
    isLegacy: r.is_legacy,
  }));

  return (
    <Card>
      {res.error && <p className="border-b border-border p-4 text-sm text-red">{friendlyDbError(res.error)}</p>}
      <p className="border-b border-border px-4 py-3 text-sm text-muted">
        QC, Stability and R&amp;D samples set aside from each batch. For raw material, &ldquo;Stability left&rdquo; is the
        stability sample not yet used by a retest.
      </p>
      <SamplesTable rows={rows} />
    </Card>
  );
}

import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { addDaysToDate } from "@/lib/dashboard-series";
import { friendlyDbError } from "@/lib/db-errors";
import { todayIst } from "@/lib/utils";
import { bucketFor } from "@/lib/ageing";
import { AgeingView, type AgeingRow } from "./ageing-view";

// Expiry and Retest Ageing (0108, Ravi 10 Oct 2026): every approved batch that
// still has stock (finished product: any approved batch) with its retest and
// expiry dates, grouped by how soon the earlier of the two falls. The
// Dashboard shows only the next 90 days (eight rows); this is the whole list,
// including what is already past.

type DbRow = {
  kind: "raw" | "production_raw" | "fp";
  batch_id: string;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  batch_label: string;
  unit: string | null;
  remaining_qty: string | number | null;
  ar_number: string | null;
  retest_date: string | null;
  expiry_date: string | null;
  is_legacy: boolean;
};

export default async function AgeingPage() {
  const supabase = await createClient();
  const today = todayIst();

  const res = await fetchAllRows<DbRow>(async (a, b) => {
    const r = await supabase
      .from("batch_ageing")
      .select("kind, batch_id, item_id, item_code, item_name, batch_label, unit, remaining_qty, ar_number, retest_date, expiry_date, is_legacy")
      .order("batch_id", { ascending: true })
      .range(a, b);
    return { data: r.data as unknown as DbRow[] | null, error: r.error };
  });

  const rows: AgeingRow[] = (res.data ?? [])
    .map((r): AgeingRow => {
      const x = bucketFor(r.retest_date, r.expiry_date, today);
      return {
        key: `${r.kind}-${r.batch_id}`,
        kind: r.kind,
        itemId: r.item_id,
        itemCode: r.item_code ?? "—",
        itemName: r.item_name ?? "—",
        batch: r.batch_label,
        unit: r.unit ?? "",
        remaining: r.remaining_qty === null ? null : Number(r.remaining_qty),
        arNumber: r.ar_number,
        retestDate: r.retest_date,
        expiryDate: r.expiry_date,
        isLegacy: r.is_legacy,
        bucket: x.bucket,
        days: x.days,
        due: x.due,
        dueDate: x.dueDate,
      };
    })
    .sort((p, q) => p.dueDate.localeCompare(q.dueDate) || p.key.localeCompare(q.key));

  return (
    <Card>
      {res.error && <p className="border-b border-border p-4 text-sm text-red">{friendlyDbError(res.error)}</p>}
      <p className="border-b border-border px-4 py-3 text-sm text-muted">
        Approved batches by the earlier of their retest and expiry dates. Raw material shows what is still in stock; finished
        product shows bulk not yet packed or sampled. Today is {today}; next 90 days end {addDaysToDate(today, 90)}.
      </p>
      <AgeingView rows={rows} />
    </Card>
  );
}

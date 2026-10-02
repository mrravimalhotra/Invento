import { redirect } from "next/navigation";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { convertUnit } from "@/lib/constants/units";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { latestQcByBatch, resolveDisplayStatus } from "@/lib/finished-product-status";
import { PackagingForm } from "../packaging-form";

export default async function NewPackagingIssuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "packaging")) redirect("/packaging");

  const supabase = await createClient();
  const [{ data: allFpBatches }, { data: packagingItems }] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("finished_product_batches")
        .select("id, batch_number, status")
        .eq("active", true)
        .order("batch_number", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("items")
        .select("id, item_code, name, unit")
        .eq("active", true)
        .eq("category", "packaging")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  // finished_product_batches.status only ever moves to 'in_process' or
  // 'submitted_to_qc' from this module's own actions — the approved/rejected
  // verdict lives on the linked quality_checks row instead (see
  // lib/finished-product-status.ts). Resolve display status the same way the
  // Finished Product list does, rather than filtering on the raw column,
  // which would never match and always report zero eligible batches.
  const candidates = allFpBatches ?? [];
  // ACC-08: id lookups in chunks (see fetchByIdChunks).
  const { data: qcRows } = await fetchByIdChunks(
    candidates.map((r) => r.id),
    (chunk) =>
      supabase
        .from("quality_checks")
        .select("finished_product_batch_id, status, created_at")
        .in("finished_product_batch_id", chunk)
        .not("finished_product_batch_id", "is", null)
  );
  const latestQc = latestQcByBatch((qcRows ?? []) as { finished_product_batch_id: string; status: string; created_at: string }[]);
  const approvedBatches = candidates.filter((b) => resolveDisplayStatus(b.status, latestQc.get(b.id)) === "approved");

  // Task F: the Store/R&D form needs each batch's own Finished Product
  // item unit, to hint/validate the structured pack size against
  // (createPackagingIssue() does the real enforcement server-side via
  // convertUnit() — this is just for the form's own hint text).
  //
  // FB-0042 (Namrata, 24 Sept 2026): "when we select the batch, it shows
  // only the batch number and not the batch name" — the batch dropdown
  // below only ever rendered `batch_number`, so two different products'
  // batches were indistinguishable without already knowing what each
  // code means. The FP item's `name` is fetched here alongside its
  // `unit` (same row, same query) and passed through as `fp_name`,
  // display-only — the option's submitted value is still the batch id.
  const { data: fullBatchRows } = await fetchByIdChunks(
    approvedBatches.map((b) => b.id),
    (chunk) =>
      supabase
        .from("finished_product_batches")
        .select("id, mfr_definition_id, batch_yield, unit, qc_sample_qty, stability_qty, rnd_qty")
        .in("id", chunk)
  );
  // FB-0052: how much of each batch is still free to pack or issue — the same
  // figure the database enforces (yield less samples less what is already
  // issued, in the product's unit; 0079). Shown per line so the person can
  // see it before saving.
  const { data: issuedRows } = await fetchAllRows((from, to) =>
    supabase
      .from("packaging_issues")
      .select("id, finished_product_batch_id, fp_qty_consumed")
      .order("id", { ascending: true })
      .range(from, to)
  );
  const issuedByBatch = new Map<string, number>();
  for (const r of issuedRows ?? []) {
    issuedByBatch.set(
      r.finished_product_batch_id,
      (issuedByBatch.get(r.finished_product_batch_id) ?? 0) + Number(r.fp_qty_consumed ?? 0)
    );
  }
  const batchInfoById = new Map((fullBatchRows ?? []).map((r) => [r.id, r]));
  const mfrDefIds = [...new Set((fullBatchRows ?? []).map((r) => r.mfr_definition_id).filter(Boolean))];
  const { data: mfrDefRows } = await fetchByIdChunks(mfrDefIds as string[], (chunk) =>
    supabase.from("mfr_definitions").select("id, finished_product_item_id").in("id", chunk)
  );
  const fpItemIds = [...new Set((mfrDefRows ?? []).map((r) => r.finished_product_item_id).filter(Boolean))] as string[];
  const { data: fpItemRows } = await fetchByIdChunks(fpItemIds, (chunk) =>
    supabase.from("items").select("id, unit, name").in("id", chunk)
  );
  const unitByItemId = new Map((fpItemRows ?? []).map((r) => [r.id, r.unit]));
  const nameByItemId = new Map((fpItemRows ?? []).map((r) => [r.id, r.name]));
  const itemIdByMfrDef = new Map((mfrDefRows ?? []).map((r) => [r.id, r.finished_product_item_id]));
  const mfrDefByBatch = new Map((fullBatchRows ?? []).map((r) => [r.id, r.mfr_definition_id]));

  const fpBatches = approvedBatches.map((b) => {
    const mfrDefId = mfrDefByBatch.get(b.id);
    const fpItemId = mfrDefId ? itemIdByMfrDef.get(mfrDefId) : null;
    const fpUnit = fpItemId ? (unitByItemId.get(fpItemId) ?? null) : null;
    const info = batchInfoById.get(b.id);
    let leftQty: number | null = null;
    if (info && info.batch_yield != null) {
      const samples = Number(info.qc_sample_qty ?? 0) + Number(info.stability_qty ?? 0) + Number(info.rnd_qty ?? 0);
      const factor = fpUnit && info.unit ? (convertUnit(1, info.unit, fpUnit) ?? 1) : 1;
      leftQty = Math.max(0, (Number(info.batch_yield) - samples) * factor - (issuedByBatch.get(b.id) ?? 0));
    }
    return {
      ...b,
      fp_unit: fpUnit,
      fp_name: fpItemId ? (nameByItemId.get(fpItemId) ?? null) : null,
      left_qty: leftQty,
    };
  });

  return (
    <div>
      <PageHeader
        title="New packaging issue"
        description="Issue finished product out to a department. For Store and R&D, add one line per pack size or batch — all lines are saved together. Pulls packaging material from stock automatically."
      />
      <Card className="max-w-3xl">
        <CardBody>
          <PackagingForm fpBatches={fpBatches ?? []} packagingItems={packagingItems ?? []} />
        </CardBody>
      </Card>
    </div>
  );
}

import { redirect } from "next/navigation";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { fpBatchBoth } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { LoadWarning } from "@/components/ui/load-warning";
import { PackagingForm } from "../packaging-form";

export default async function NewPackagingIssuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "packaging")) redirect("/packaging");

  const supabase = await createClient();
  // SCAN-P6-03 (Ravi, 12 Oct 2026): the approved batches, with product name, unit and the
  // quantity still free to pack or issue, come from one database view
  // (fp_batch_packing_options, migration 0114). Before, this page read every finished
  // product batch, quality check and packaging issue and worked it out here. The figure
  // is the one the database enforces when the issue is saved (yield less samples, less
  // what is already issued, in the product's unit).
  const [{ data: batchRows, error: batchError }, { data: packagingItems }] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from("fp_batch_packing_options")
        .select("id, batch_number, short_batch_no, is_legacy, fp_name, fp_unit, left_qty")
        .order("batch_number", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      supabase
        .from("items")
        .select("id, item_code, name, unit")
        .eq("active", true)
        .eq("category", "packaging")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  // FB-0052: packaging material on hand, so the form can say "not enough
  // stock" while the person types (the database still checks when saving).
  const { data: balanceRows } = await fetchByIdChunks(
    (packagingItems ?? []).map((i) => i.id),
    (chunk) => supabase.from("stock_balance").select("item_id, on_hand").in("item_id", chunk),
  );
  const onHandByItem = new Map((balanceRows ?? []).map((r) => [r.item_id, Number(r.on_hand ?? 0)]));
  const packagingOptions = (packagingItems ?? []).map((i) => ({ ...i, on_hand: onHandByItem.get(i.id) ?? 0 }));

  // FB-0042 (Namrata, 24 Sept 2026): the dropdown shows the product name beside
  // the batch number (fp_name); FB-0050: the full number with the short one beside it.
  const fpBatches = (batchRows ?? []).map((b) => ({
    id: b.id as string,
    // FB-0050: the picker shows the full number with the short one beside it.
    batch_number: fpBatchBoth(b.batch_number as string, b.short_batch_no as string | null),
    is_legacy: b.is_legacy as boolean | null,
    fp_unit: (b.fp_unit as string | null) ?? null,
    fp_name: (b.fp_name as string | null) ?? null,
    left_qty: b.left_qty !== null && b.left_qty !== undefined ? Number(b.left_qty) : null,
  }));

  return (
    <div>
      <PageHeader
        title="New packaging issue"
        description="Issue finished product out to a department, one line per pack size or batch — all lines are saved together. Store and R&D lines pull packaging material from stock automatically; Production lines use none."
      />
      <LoadWarning errors={[batchError]} what="the batch list" />
      <Card className="max-w-6xl">
        <CardBody>
          <PackagingForm fpBatches={fpBatches} packagingItems={packagingOptions} />
        </CardBody>
      </Card>
    </div>
  );
}

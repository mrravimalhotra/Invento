import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/utils";
import { WeighmentLineForm, ObservationForm, SignOffPanel } from "../bmr-forms";

type ItemRow = { id: string; name: string; item_code: string; unit: string | null };
type ApprovedBatch = { id: string; batch_number: string; expiry_date: string | null; item_id: string };

export default async function BmrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const { data: record } = await supabase
    .from("bmr_records")
    .select(
      "id, finished_product_batch_id, prepared_by, prepared_at, checked_by, checked_at, approved_by, approved_at, finished_product_batches(batch_number, mfr_definition_id, mfr_version)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!record) notFound();

  const fp = (record as unknown as { finished_product_batches: { batch_number: string; mfr_definition_id: string; mfr_version: number } | null })
    .finished_product_batches;
  const canEdit = canWrite(user.roles, "bmr");

  const [
    { data: weighmentLinesRaw },
    { data: observationsRaw },
    { data: itemsRaw },
    { data: mfrLinesRaw },
    { data: componentsRaw },
  ] = await Promise.all([
    supabase
      .from("bmr_weighment_lines")
      .select("id, item_id, purchase_line_id, standard_qty, actual_qty, items(name, unit), purchase_lines(batch_number)")
      .eq("bmr_record_id", id),
    supabase
      .from("bmr_observations")
      .select("id, step_label, reading, recorded_by, recorded_at")
      .eq("bmr_record_id", id)
      .order("recorded_at", { ascending: true }),
    supabase
      .from("items")
      .select("id, name, item_code, unit")
      .eq("active", true)
      .in("category", ["raw", "processed"])
      .order("created_at", { ascending: false }),
    fp
      ? supabase
          .from("mfr_lines")
          .select("item_id, quantity")
          .eq("mfr_definition_id", fp.mfr_definition_id)
          .eq("version", fp.mfr_version)
      : Promise.resolve({ data: [] as { item_id: string; quantity: number }[] }),
    supabase
      .from("finished_product_components")
      .select("item_id, purchase_line_id")
      .eq("finished_product_batch_id", record.finished_product_batch_id),
  ]);

  const items: ItemRow[] = itemsRaw ?? [];
  const itemIds = items.map((i) => i.id);

  const [{ data: approvedStatusRows }, { data: candidateBatches }] = await Promise.all([
    supabase.from("purchase_batch_status").select("purchase_line_id, qc_status").eq("qc_status", "approved"),
    itemIds.length
      ? supabase
          .from("purchase_lines")
          .select("id, item_id, batch_number, expiry_date")
          .in("item_id", itemIds)
          .eq("active", true)
          .order("expiry_date", { ascending: true })
      : Promise.resolve({ data: [] as ApprovedBatch[] }),
  ]);

  const approvedIds = new Set((approvedStatusRows ?? []).map((r) => r.purchase_line_id));
  const batchesByItem: Record<string, ApprovedBatch[]> = {};
  for (const b of (candidateBatches ?? []) as ApprovedBatch[]) {
    if (!approvedIds.has(b.id)) continue;
    (batchesByItem[b.item_id] ??= []).push(b);
  }

  const standardQtyByItem: Record<string, number> = {};
  for (const line of (mfrLinesRaw ?? []) as { item_id: string; quantity: number | string }[]) {
    standardQtyByItem[line.item_id] = Number(line.quantity);
  }

  const defaultBatchByItem: Record<string, string> = {};
  for (const comp of (componentsRaw ?? []) as { item_id: string; purchase_line_id: string }[]) {
    if (!defaultBatchByItem[comp.item_id]) defaultBatchByItem[comp.item_id] = comp.purchase_line_id;
  }

  type WeighmentLine = {
    id: string;
    standard_qty: number | string;
    actual_qty: number | string | null;
    items: { name: string; unit: string | null } | null;
    purchase_lines: { batch_number: string } | null;
  };
  const weighmentLines = (weighmentLinesRaw ?? []) as unknown as WeighmentLine[];

  type Observation = { id: string; step_label: string; reading: string | null; recorded_by: string | null; recorded_at: string };
  const observations = (observationsRaw ?? []) as Observation[];

  const signerIds = [record.prepared_by, record.checked_by, record.approved_by, ...observations.map((o) => o.recorded_by)].filter(
    (v): v is string => !!v
  );
  const { data: profiles } = signerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", [...new Set(signerIds)])
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  return (
    <div>
      <PageHeader
        title={`BMR — ${fp?.batch_number ?? "Unknown batch"}`}
        description="Batch Manufacturing Record: weighment lines, in-process observations, and Prepared / Checked / Approved sign-off."
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Sign-off" />
          <CardBody>
            {canEdit ? (
              <SignOffPanel
                bmrRecordId={record.id}
                preparedAt={record.prepared_at}
                preparedBy={record.prepared_by ? nameById.get(record.prepared_by) ?? null : null}
                checkedAt={record.checked_at}
                checkedBy={record.checked_by ? nameById.get(record.checked_by) ?? null : null}
                approvedAt={record.approved_at}
                approvedBy={record.approved_by ? nameById.get(record.approved_by) ?? null : null}
              />
            ) : (
              <p className="text-sm text-muted">
                Prepared: {record.prepared_at ? formatDate(record.prepared_at) : "Not yet"} · Checked:{" "}
                {record.checked_at ? formatDate(record.checked_at) : "Not yet"} · Approved:{" "}
                {record.approved_at ? formatDate(record.approved_at) : "Not yet"}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Weighment lines" />
          <CardBody className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Standard qty</th>
                    <th className="px-3 py-2">Actual qty</th>
                  </tr>
                </thead>
                <tbody>
                  {weighmentLines.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted">
                        No weighment lines yet.
                      </td>
                    </tr>
                  )}
                  {weighmentLines.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{l.items?.name ?? "—"}</td>
                      <td className="px-3 py-2">{l.purchase_lines?.batch_number ?? "—"}</td>
                      <td className="px-3 py-2">
                        {formatNumber(l.standard_qty)} {l.items?.unit ?? ""}
                      </td>
                      <td className="px-3 py-2">
                        {l.actual_qty === null ? "—" : `${formatNumber(l.actual_qty)} ${l.items?.unit ?? ""}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && (
              <WeighmentLineForm
                bmrRecordId={record.id}
                items={items}
                batchesByItem={batchesByItem}
                defaultBatchByItem={defaultBatchByItem}
                standardQtyByItem={standardQtyByItem}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Observations" />
          <CardBody className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">Step</th>
                    <th className="px-3 py-2">Reading</th>
                    <th className="px-3 py-2">Recorded by</th>
                    <th className="px-3 py-2">Recorded at</th>
                  </tr>
                </thead>
                <tbody>
                  {observations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted">
                        No observations yet.
                      </td>
                    </tr>
                  )}
                  {observations.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{o.step_label}</td>
                      <td className="px-3 py-2">{o.reading ?? "—"}</td>
                      <td className="px-3 py-2">{o.recorded_by ? nameById.get(o.recorded_by) ?? "—" : "—"}</td>
                      <td className="px-3 py-2">{formatDate(o.recorded_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && <ObservationForm bmrRecordId={record.id} />}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

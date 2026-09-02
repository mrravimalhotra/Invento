import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import { resolveDisplayStatus } from "@/lib/finished-product-status";
import { CompleteBatchForm } from "./complete-batch-form";
import { SubmitToQcForm } from "./submit-to-qc-form";

export default async function FinishedProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);

  const { data: batch } = await supabase
    .from("finished_product_batches")
    .select(
      "id, batch_number, mfr_definition_id, mfr_version, target_qty, unit, batch_yield, actual_yield_pct, expiry_month, finish_date, qc_sample_qty, stability_qty, rnd_qty, status, expiry_date, mfr_definitions(id, code, name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!batch) notFound();

  const [{ data: components }, { data: qcRows }] = await Promise.all([
    supabase
      .from("finished_product_components")
      .select("id, quantity, items(item_code, name, unit), purchase_lines(batch_number, expiry_date)")
      .eq("finished_product_batch_id", id),
    supabase
      .from("quality_checks")
      .select("id, ar_number, status, reviewed_at, review_comments")
      .eq("finished_product_batch_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const latestQc = qcRows?.[0] ?? null;
  const displayStatus = resolveDisplayStatus(batch.status, latestQc);
  const canEdit = canWrite(user?.roles ?? [], "finished_product");
  const mfr = batch.mfr_definitions as unknown as { id: string; code: string; name: string } | null;

  type ComponentRow = {
    id: string;
    quantity: string | number;
    items: { item_code: string; name: string; unit: string | null } | null;
    purchase_lines: { batch_number: string; expiry_date: string | null } | null;
  };
  const componentRows = (components ?? []) as unknown as ComponentRow[];

  return (
    <div>
      <PageHeader
        title={batch.batch_number}
        description={mfr ? `Built from ${mfr.code} · ${mfr.name} (recipe v${batch.mfr_version})` : `Recipe v${batch.mfr_version}`}
        action={<Badge status={displayStatus}>{displayStatus.replace(/_/g, " ")}</Badge>}
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader title="Batch header" />
          <CardBody className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <span className="text-muted">MFR</span>
              <p className="mt-1 font-medium">
                {mfr ? (
                  <Link href={`/mfr/${mfr.id}`} className="text-brand hover:underline">
                    {mfr.code} · {mfr.name}
                  </Link>
                ) : (
                  "—"
                )}
              </p>
            </div>
            <div>
              <span className="text-muted">Target quantity</span>
              <p className="mt-1 font-medium">
                {formatNumber(batch.target_qty)} {batch.unit}
              </p>
            </div>
            <div>
              <span className="text-muted">Expiry date</span>
              <p className="mt-1 font-medium">{formatDate(batch.expiry_date)}</p>
            </div>
            <div>
              <span className="text-muted">Batch yield</span>
              <p className="mt-1 font-medium">{batch.batch_yield != null ? `${formatNumber(batch.batch_yield)} ${batch.unit}` : "—"}</p>
            </div>
            <div>
              <span className="text-muted">Actual yield % (generated)</span>
              <p className="mt-1 font-medium">{batch.actual_yield_pct != null ? `${formatNumber(batch.actual_yield_pct)}%` : "—"}</p>
            </div>
            <div>
              <span className="text-muted">Finish date</span>
              <p className="mt-1 font-medium">{formatDate(batch.finish_date)}</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Composition (RM batches consumed)" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5">RM batch</th>
                    <th className="px-4 py-2.5">Expiry</th>
                    <th className="px-4 py-2.5">Quantity consumed</th>
                  </tr>
                </thead>
                <tbody>
                  {componentRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted">
                        No components recorded.
                      </td>
                    </tr>
                  )}
                  {componentRows.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">{c.items ? `${c.items.item_code} · ${c.items.name}` : "—"}</td>
                      <td className="px-4 py-2.5">{c.purchase_lines?.batch_number ?? "—"}</td>
                      <td className="px-4 py-2.5">{formatDate(c.purchase_lines?.expiry_date)}</td>
                      <td className="px-4 py-2.5">
                        {formatNumber(c.quantity)} {c.items?.unit ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {latestQc && (
          <Card>
            <CardHeader title="QC record" />
            <CardBody className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <span className="text-muted">AR number</span>
                <p className="mt-1 font-medium">{latestQc.ar_number}</p>
              </div>
              <div>
                <span className="text-muted">QC status</span>
                <p className="mt-1">
                  <Badge status={latestQc.status}>{latestQc.status}</Badge>
                </p>
              </div>
              <div>
                <span className="text-muted">Reviewed</span>
                <p className="mt-1 font-medium">{latestQc.reviewed_at ? formatDate(latestQc.reviewed_at) : "Pending review"}</p>
              </div>
              {latestQc.review_comments && (
                <div className="sm:col-span-3">
                  <span className="text-muted">Comments</span>
                  <p className="mt-1">{latestQc.review_comments}</p>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {canEdit && batch.status === "in_process" && (
          <Card>
            <CardHeader title="Complete batch" />
            <CardBody>
              <p className="mb-4 text-xs text-muted">
                Actual yield % above is computed by the database from Batch yield — it is not editable directly.
              </p>
              <CompleteBatchForm
                batchId={id}
                unit={batch.unit}
                defaults={{
                  batch_yield: batch.batch_yield,
                  finish_date: batch.finish_date,
                  expiry_month: batch.expiry_month,
                  qc_sample_qty: batch.qc_sample_qty,
                  stability_qty: batch.stability_qty,
                  rnd_qty: batch.rnd_qty,
                }}
              />
            </CardBody>
          </Card>
        )}

        {canEdit && batch.status === "in_process" && (
          <Card>
            <CardHeader
              title="Submit to QC"
              action={<SubmitToQcForm batchId={id} />}
            />
            <CardBody>
              <p className="text-sm text-muted">
                Moves this batch to <Badge status="submitted_to_qc">submitted to qc</Badge> and opens a QC record
                (AR number) for it — the same gate the legacy system uses (&ldquo;Finish Product Intimation
                Slip&rdquo;) before
                a batch can be released. A QC reviewer sets it Approved/Rejected on the QC Review screen; this page
                reflects that verdict automatically once set.
              </p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

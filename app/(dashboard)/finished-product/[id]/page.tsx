import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AuditHistoryLink } from "@/components/ui/audit-history-link";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { afterCompletion } from "@/lib/fp-after-completion";
import { formatDate, formatNumber, formatQty, fpBatchBoth, fpBatchShort } from "@/lib/utils";
import { resolveDisplayStatus, fpStatusLabel } from "@/lib/finished-product-status";
import { CompleteBatchForm } from "./complete-batch-form";
import { SubmitToQcForm } from "./submit-to-qc-form";
import { DraftActionsPanel } from "./draft-actions-panel";
import { FpIntimationLink } from "./fp-intimation-link";
import { BmrDownloadLink } from "./bmr-download-link";
import { statusLabel } from "@/lib/status-labels";

export default async function FinishedProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);

  // Lazy 30-minute draft auto-expiry (0046_fp_batch_draft_cancel.sql) —
  // this app has no cron/background job of any kind, so a stale draft
  // only actually flips to "cancelled" (and gets its RM returned) the
  // next time someone loads the FP list or a batch's own detail page.
  // Cheap no-op when nothing is stale; run before the select below so a
  // stale visit to THIS batch reflects the fresh status immediately
  // rather than one page-load behind.
  await supabase.rpc("expire_stale_fp_drafts");

  const { data: batch } = await supabase
    .from("finished_product_batches")
    .select(
      // Ravi (15 Sept 2026): mfr_definitions -> items:finished_product_item_id
      // added for the new Finish Product Intimation Slip (fp-intimation-pdf.ts)
      // below, which needs the FP item's own code/name ("F.P.Code" / "Name of
      // The Product" on the slip) — same embedded-select alias pattern
      // app/(dashboard)/mfr/[id]/page.tsx already uses for the same FK.
      "id, batch_number, short_batch_no, is_legacy, mfr_definition_id, mfr_version, target_qty, unit, batch_yield, actual_yield_pct, expiry_month, finish_date, qc_sample_qty, stability_qty, rnd_qty, yield_reason, status, batch_start_date, created_at, mfr_definitions(id, code, name, theoretical_yield_pct, permissible_yield_pct, items:finished_product_item_id(item_code, name, unit))"
    )
    .eq("id", id)
    .maybeSingle();
  if (!batch) notFound();

  const [{ data: components }, { data: qcRows }] = await Promise.all([
    supabase
      .from("finished_product_components")
      // purchase_line_id added for the Batch Manufacturing Record below,
      // which needs each consumed RM batch's own AR number — a second
      // query, once these rows are in hand (see bmrArByPurchaseLine
      // below). production_batch_id / production_issue_batches (19 Sept
      // 2026 — "Packaging issued to Production", see supabase/migrations/
      // 0050_production_rm_from_packaging.sql): a component can instead be
      // sourced from a Production-converted Raw Material batch, which has
      // no purchase_lines row and no AR number (no QC record — its
      // clearance came from the original Finished Product batch's own QC
      // approval) but still has its own batch number, needed here for
      // traceability.
      .select(
        "id, quantity, purchase_line_id, production_batch_id, items(item_code, name, unit), purchase_lines(batch_number), production_issue_batches(batch_number)"
      )
      .eq("finished_product_batch_id", id),
    supabase
      .from("quality_checks")
      // created_at added for the Finish Product Intimation Slip's "Date"
      // field below — the date this batch was actually submitted to QC.
      .select("id, ar_number, status, reviewed_at, review_comments, created_at, is_retest, retest_date, expiry_date")
      .eq("finished_product_batch_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const latestQc = qcRows?.[0] ?? null;
  // The intimation slip keeps the date the batch first went to QC; a retest does not change it.
  const firstQc = qcRows && qcRows.length > 0 ? qcRows[qcRows.length - 1] : null;
  const earlierQcs = (qcRows ?? []).slice(1);
  const displayStatus = resolveDisplayStatus(batch.status, latestQc);
  const canEdit = canWrite(user?.roles ?? [], "finished_product");
  const mfr = batch.mfr_definitions as unknown as {
    id: string;
    code: string;
    name: string;
    theoretical_yield_pct: number | null;
    permissible_yield_pct: number | null;
    items: { item_code: string; name: string; unit: string | null } | null;
  } | null;
  const fpItem = mfr?.items ?? null;

  type ComponentRow = {
    id: string;
    quantity: string | number;
    purchase_line_id: string | null;
    production_batch_id: string | null;
    items: { item_code: string; name: string; unit: string | null } | null;
    purchase_lines: { batch_number: string } | null;
    production_issue_batches: { batch_number: string } | null;
  };
  const componentRows = (components ?? []) as unknown as ComponentRow[];

  // Ravi (15 Sept 2026): the Batch Manufacturing Record's RM table has an
  // "AR No." column per consumed RM batch — the QC record raised against
  // that specific purchase line when it was originally received, not
  // anything tied to this FP batch's own (separate) QC submission. A
  // purchase line only ever has one quality_checks row
  // (quality_checks_purchase_line_unique, 0015), so this is a plain
  // lookup, not an aggregation.
  const purchaseLineIds = [...new Set(componentRows.map((c) => c.purchase_line_id).filter((v): v is string => !!v))];
  const { data: rmQcRows } = purchaseLineIds.length
    ? await supabase.from("quality_checks").select("purchase_line_id, ar_number").in("purchase_line_id", purchaseLineIds)
    : { data: [] };
  const arByPurchaseLine = new Map((rmQcRows ?? []).map((r) => [r.purchase_line_id as string, r.ar_number as string]));

  // SCAN-P5-11: raw material made by Production (migration 0068) goes through
  // QC too, against its production batch, and has its own AR number. Later
  // records win, so a retest shows the AR number of the latest check.
  const productionBatchIds = [...new Set(componentRows.map((c) => c.production_batch_id).filter((v): v is string => !!v))];
  const { data: prodQcRows } = productionBatchIds.length
    ? await supabase
        .from("quality_checks")
        .select("production_batch_id, ar_number")
        .in("production_batch_id", productionBatchIds)
        .order("created_at", { ascending: true })
    : { data: [] };
  const arByProductionBatch = new Map((prodQcRows ?? []).map((r) => [r.production_batch_id as string, r.ar_number as string]));

  // "Once Batch is in Completed - Awaiting QC, start showing link" — and,
  // per the same precedent set for the Finish Product Intimation Slip
  // above, this stays available in every status reached from there
  // onward (submitted_to_qc, approved, rejected), not only while the
  // batch is in that exact one status.
  const bmrEligible = !["draft", "in_process", "cancelled"].includes(batch.status);

  // SCAN-P5-14: "After completion" card — samples, packed quantity, bulk left
  // and the packing runs that used this batch.
  type PackingRun = {
    id: string;
    code: string | null;
    pack_size: string | null;
    unit_count: number | null;
    department: string | null;
    issue_date: string | null;
    fp_qty_consumed: string | number | null;
  };
  let packingRuns: PackingRun[] = [];
  let packingLoadFailed = false;
  if (bmrEligible) {
    const { data: runs, error: runsError } = await supabase
      .from("packaging_issues")
      .select("id, code, pack_size, unit_count, department, issue_date, fp_qty_consumed")
      .eq("finished_product_batch_id", id)
      .order("issue_date", { ascending: false })
      .order("id", { ascending: true })
      .limit(500);
    packingRuns = (runs ?? []) as unknown as PackingRun[];
    packingLoadFailed = !!runsError;
  }
  const after = afterCompletion({
    batchYield: batch.batch_yield,
    batchUnit: batch.unit,
    itemUnit: fpItem?.unit ?? null,
    qcSample: batch.qc_sample_qty,
    stability: batch.stability_qty,
    rnd: batch.rnd_qty,
    issuedInItemUnit: packingRuns.map((r) => Number(r.fp_qty_consumed ?? 0)),
  });
  const DEPARTMENT_LABELS: Record<string, string> = { production: "Production", rnd: "R&D", store: "Store" };

  return (
    <div>
      <PageHeader
        title={fpBatchBoth(batch.batch_number, batch.short_batch_no)}
        description={mfr ? `Built from ${mfr.code} · ${mfr.name} (recipe v${batch.mfr_version})` : `Recipe v${batch.mfr_version}`}
        action={
          <div className="flex items-center gap-2">
            <AuditHistoryLink recordId={batch.id} roles={user?.roles ?? []} />
            {batch.is_legacy && <LegacyTag show />}
            <Badge status={displayStatus}>{fpStatusLabel(displayStatus)}</Badge>
          </div>
        }
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader
            title="Batch header"
            action={
              bmrEligible ? (
                <BmrDownloadLink
                  fpCode={fpItem?.item_code ?? "—"}
                  fpName={fpItem?.name ?? "—"}
                  batchNo={fpBatchShort(batch.batch_number, batch.short_batch_no)}
                  batchSize={batch.target_qty}
                  unit={batch.unit}
                  startDate={formatDate(batch.batch_start_date)}
                  endDate={formatDate(batch.finish_date)}
                  batchYield={batch.batch_yield ?? 0}
                  yieldPct={batch.actual_yield_pct ?? 0}
                  // Ravi (15 Sept 2026): "'List of Raw Material Obtained
                  // from store on date' will be same as start date of
                  // batch" — batch_start_date, not created_at or any QC
                  // date.
                  rmObtainedDate={formatDate(batch.batch_start_date)}
                  components={componentRows.map((c) => ({
                    rmCode: c.items?.item_code ?? "—",
                    rmName: c.items?.name ?? "—",
                    batchNo: c.purchase_lines?.batch_number ?? c.production_issue_batches?.batch_number ?? "—",
                    arNumber: c.purchase_line_id
                      ? arByPurchaseLine.get(c.purchase_line_id) ?? ""
                      : c.production_batch_id
                        ? arByProductionBatch.get(c.production_batch_id) ?? ""
                        : "",
                    qtyAsPerMfr: c.quantity,
                    // FB-0041: already fetched by this same query
                    // (items(item_code, name, unit) above) — just wasn't
                    // being passed through to the BMR document before.
                    unit: c.items?.unit ?? "",
                  }))}
                />
              ) : undefined
            }
          />
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
                {formatQty(batch.target_qty)} {batch.unit}
              </p>
            </div>
            <div>
              <span className="text-muted">Batch start date</span>
              <p className="mt-1 font-medium">{formatDate(batch.batch_start_date)}</p>
            </div>
            <div>
              <span className="text-muted">Batch yield</span>
              <p className="mt-1 font-medium">{batch.batch_yield != null ? `${formatQty(batch.batch_yield)} ${batch.unit}` : "—"}</p>
            </div>
            <div>
              <span className="text-muted">Actual yield % (generated)</span>
              <p className="mt-1 font-medium">{batch.actual_yield_pct != null ? `${formatNumber(batch.actual_yield_pct)}%` : "—"}</p>
            </div>
            {batch.yield_reason && (
              <div className="sm:col-span-2">
                <span className="text-muted">Reason for yield outside the allowed range</span>
                <p className="mt-1 font-medium text-amber">{batch.yield_reason}</p>
              </div>
            )}
            <div>
              <span className="text-muted">Finish date</span>
              <p className="mt-1 font-medium">{formatDate(batch.finish_date)}</p>
            </div>
            {/* expiry_month, not expiry_date — see migration 0044's comment.
                Only known once Complete Batch has been saved; blank ("—")
                until then, by design. */}
            <div>
              <span className="text-muted">Expiry date</span>
              <p className="mt-1 font-medium">{formatDate(batch.expiry_month)}</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          {/* ACC-31: the "Re-Test Date" column is gone — it read
              purchase_lines.expiry_date, which is no longer collected (3 Sept
              2026), so it was blank for every new batch. The real retest date
              is QC's (quality_checks.retest_date) and is shown on the RM
              batch's own screens. */}
          <CardHeader title="Composition (RM batches consumed)" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5">RM batch</th>
                    <th className="px-4 py-2.5">Quantity consumed</th>
                  </tr>
                </thead>
                <tbody>
                  {componentRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-muted">
                        No components recorded.
                      </td>
                    </tr>
                  )}
                  {componentRows.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">{c.items ? `${c.items.item_code} · ${c.items.name}` : "—"}</td>
                      <td className="px-4 py-2.5">
                        {c.purchase_lines?.batch_number ?? c.production_issue_batches?.batch_number ?? "—"}
                        {c.production_batch_id && <span className="text-muted"> (from Production)</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {formatQty(c.quantity)} {c.items?.unit ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {bmrEligible && (
          <Card>
            <CardHeader
              title="After completion"
              action={
                <Link href="/packaging" className="text-sm text-brand hover:underline">
                  Open Packaging
                </Link>
              }
            />
            <CardBody className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <span className="text-muted">Samples taken</span>
                <p className="mt-1 font-medium">
                  QC {formatQty(batch.qc_sample_qty ?? 0)} · Stability {formatQty(batch.stability_qty ?? 0)} · R&amp;D{" "}
                  {formatQty(batch.rnd_qty ?? 0)} {batch.unit}
                </p>
              </div>
              <div>
                <span className="text-muted">Packed (bulk used by packaging)</span>
                <p className="mt-1 font-medium">
                  {formatQty(after.packed)} {batch.unit}
                </p>
              </div>
              <div>
                <span className="text-muted">Bulk remaining (unpacked)</span>
                <p className="mt-1 font-medium">{after.left != null ? `${formatQty(after.left)} ${batch.unit}` : "—"}</p>
              </div>
              <div className="sm:col-span-3">
                <span className="text-muted">Packing runs</span>
                {packingLoadFailed ? (
                  <p className="mt-1 text-red">The packing runs could not be loaded. Reload the page.</p>
                ) : packingRuns.length === 0 ? (
                  <p className="mt-1 text-muted">None yet.</p>
                ) : (
                  <div className="mt-1 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                          <th className="py-1.5 pr-4">Code</th>
                          <th className="py-1.5 pr-4">Issue date</th>
                          <th className="py-1.5 pr-4">Department</th>
                          <th className="py-1.5 pr-4">Pack size</th>
                          <th className="py-1.5 pr-4">Unit count</th>
                          <th className="py-1.5">Bulk used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packingRuns.map((r) => (
                          <tr key={r.id} className="border-b border-border last:border-0">
                            <td className="py-1.5 pr-4 font-mono text-xs">{r.code ?? "—"}</td>
                            <td className="py-1.5 pr-4">{formatDate(r.issue_date)}</td>
                            <td className="py-1.5 pr-4">{r.department ? DEPARTMENT_LABELS[r.department] ?? r.department : "—"}</td>
                            <td className="py-1.5 pr-4">{r.pack_size ?? "—"}</td>
                            <td className="py-1.5 pr-4">{r.unit_count ?? "—"}</td>
                            <td className="py-1.5">
                              {r.fp_qty_consumed != null ? `${formatQty(r.fp_qty_consumed)} ${fpItem?.unit ?? ""}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {latestQc && (
          <Card>
            <CardHeader title="QC record" />
            <CardBody className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <span className="text-muted">Analytical Report No.</span>
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
              {/* Ravi (15 Sept 2026): "when a Finished Product batch is
                  submitted to QC, a Finish Product Intimation Slip should be
                  generated and link should be available in Finished Product
                  Screen similar to RM Intimation Slip." This card only
                  renders once latestQc exists (a quality_checks row was
                  created), which is exactly the "submitted to QC" moment —
                  so no extra status gate is needed for this link. */}
              <div>
                <span className="text-muted">Finish Product Intimation Slip</span>
                <p className="mt-1">
                  <FpIntimationLink
                    itemName={fpItem?.name ?? "—"}
                    itemCode={fpItem?.item_code ?? "—"}
                    batchNumber={fpBatchShort(batch.batch_number, batch.short_batch_no)}
                    batchQty={batch.batch_yield}
                    unit={batch.unit}
                    qcSampleQty={batch.qc_sample_qty}
                    submittedAt={firstQc?.created_at ?? latestQc.created_at}
                  />
                </p>
              </div>
              {latestQc.review_comments && (
                <div className="sm:col-span-3">
                  <span className="text-muted">Comments</span>
                  <p className="mt-1">{latestQc.review_comments}</p>
                </div>
              )}
              {(latestQc.is_retest || earlierQcs.length > 0) && (
                <div className="sm:col-span-3">
                  <span className="text-muted">QC records of this batch (newest first)</span>
                  <ul className="mt-1 flex flex-col gap-1">
                    {(qcRows ?? []).map((q, i, all) => (
                      <li key={q.id}>
                        <Link href={`/qc/${q.id}`} className="font-medium underline">
                          {q.ar_number}
                        </Link>{" "}
                        · {q.is_retest ? `Retest ${all.length - i - 1}` : "First QC"} · {statusLabel(q.status)}
                        {q.reviewed_at ? ` · reviewed ${formatDate(q.reviewed_at)}` : ""}
                        {q.status === "approved" && q.retest_date ? ` · next retest ${formatDate(q.retest_date)}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {batch.status === "draft" && (
          <DraftActionsPanel batchId={id} createdAt={batch.created_at} canEdit={canEdit} />
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
                startDate={batch.batch_start_date}
                batchSize={batch.target_qty}
                theoreticalPct={mfr?.theoretical_yield_pct ?? null}
                permissiblePct={mfr?.permissible_yield_pct ?? null}
                defaults={{
                  batch_yield: batch.batch_yield,
                  finish_date: batch.finish_date,
                  expiry_month: batch.expiry_month,
                  qc_sample_qty: batch.qc_sample_qty,
                  stability_qty: batch.stability_qty,
                  rnd_qty: batch.rnd_qty,
                  yield_reason: batch.yield_reason,
                }}
              />
            </CardBody>
          </Card>
        )}

        {canEdit && batch.status === "complete_awaiting_qc" && (
          <Card>
            <CardHeader
              title="Submit to QC"
              action={<SubmitToQcForm batchId={id} />}
            />
            <CardBody>
              <p className="text-sm text-muted">
                Moves this batch to <Badge status="submitted_to_qc">submitted to qc</Badge> and opens a QC record
                (Analytical Report No.) for it — the same gate the legacy system uses (&ldquo;Finish Product Intimation
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

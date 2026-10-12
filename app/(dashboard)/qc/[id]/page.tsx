import { qcRoundOutcomes } from "@/lib/qc-rounds";
import { loadQcTemplate } from "@/lib/qc-template";
import { QC_EVENT_LABELS, finalResults, type QcResultLine } from "@/lib/qc-results";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuditHistoryLink } from "@/components/ui/audit-history-link";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatQty, fpBatchBoth } from "@/lib/utils";
import { qcRecordStatusLabel } from "@/lib/batch-qc-status";
import { MAX_RM_RETESTS, MAX_RM_RETEST_DAYS } from "@/lib/constants/qc-rules";
import { countRetestsDone } from "@/lib/qc-retests";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { QcCheckerForm } from "./qc-checker-form";
import { QcReviewerForm } from "./qc-reviewer-form";
import { ProposedRejectionForm, VoidRejectionForm } from "./qc-rejection-forms";
import { ResultsTable } from "./results-table";

type QcDetail = {
  id: string;
  ar_number: string;
  status: string;
  sample_qty: string | number | null;
  sample_unit: string | null;
  expiry_date: string | null;
  checker_comments: string | null;
  checker_by: string | null;
  checker_at: string | null;
  review_comments: string | null;
  retest_period_days: number | null;
  retest_date: string | null;
  is_retest: boolean;
  is_legacy: boolean;
  purchase_line_id: string | null;
  production_batch_id: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  finished_product_batch_id: string | null;
  checker_results: QcResultLine[] | null;
  reviewer_results: QcResultLine[] | null;
  items: { item_code: string; name: string } | null;
  purchase_lines: { batch_number: string; quantity: string | number; unit: string; expiry_date: string | null; is_legacy: boolean } | null;
  finished_product_batches: { batch_number: string; short_batch_no: string | null } | null;
  // FB-0043: a Production-issued RM batch's own batch number.
  production_issue_batches: { batch_number: string } | null;
};

export default async function QualityCheckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("quality_checks")
    .select(
      "id, ar_number, status, sample_qty, sample_unit, expiry_date, checker_comments, checker_by, checker_at, review_comments, retest_period_days, retest_date, is_retest, is_legacy, purchase_line_id, production_batch_id, finished_product_batch_id, checker_results, reviewer_results, created_by, reviewed_by, reviewed_at, items(item_code, name), purchase_lines(batch_number, quantity, unit, expiry_date, is_legacy), finished_product_batches(batch_number, short_batch_no), production_issue_batches(batch_number)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const record = data as unknown as QcDetail;
  const batchLabel =
    record.purchase_lines?.batch_number ??
    (record.finished_product_batches
      ? fpBatchBoth(record.finished_product_batches.batch_number, record.finished_product_batches.short_batch_no)
      : null) ??
    record.production_issue_batches?.batch_number ??
    "—";
  // FB-0058 / FB-0061 (3 Oct 2026): a batch (raw material or finished product) is retested at most 3
  // times. On the 3rd retest the Reviewer sets only the Expiry date; the batch is
  // then usable until that date. A retest also starts from the previous expiry.
  let isFinalRetest = false;
  let suggestedExpiry = record.expiry_date;
  // SCAN-P4-03: a retest cannot set a later expiry than the batch was last approved with.
  let maxExpiry: string | undefined;
  if (record.status === "checker_approved" && record.is_retest) {
    const col = record.purchase_line_id
      ? "purchase_line_id"
      : record.production_batch_id
        ? "production_batch_id"
        : "finished_product_batch_id";
    const batchId = (record.purchase_line_id ?? record.production_batch_id ?? record.finished_product_batch_id) as string;
    const retestsDone = await countRetestsDone(supabase, {
      purchaseLineId: record.purchase_line_id,
      productionBatchId: record.production_batch_id,
      finishedProductBatchId: record.finished_product_batch_id,
    });
    isFinalRetest = retestsDone >= MAX_RM_RETESTS;
    const { data: prev } = await supabase
      .from("quality_checks")
      .select("expiry_date")
      .eq(col, batchId)
      .neq("id", record.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1);
    suggestedExpiry = prev?.[0]?.expiry_date ?? null;
    maxExpiry = prev?.[0]?.expiry_date ?? undefined;
  }
  // Opening stock: a Pending QC batch loaded with its manufacturer expiry date starts from it.
  if (!suggestedExpiry && record.purchase_lines?.expiry_date) suggestedExpiry = record.purchase_lines.expiry_date;
  const canRound1 = canWrite(user.roles, "qc_review_round1");
  const canRound2 = canWrite(user.roles, "qc_review_round2");

  // Two-round review (20 Sept 2026): three identities to resolve — who
  // assigned the AR (audit only, no longer enforced as a distinct
  // "maker"), who made the Round 1 (QC Checker) decision, and who made
  // the Round 2 (QC Reviewer) decision. Three separate lookups (not an
  // embedded join) since quality_checks has three different foreign keys
  // into auth.users/profiles, same pattern MFR's approved_by ->
  // profiles.full_name lookup already uses.
  const [assignerProfile, checkerProfile, reviewerProfile] = await Promise.all([
    record.created_by
      ? supabase.from("profiles").select("full_name").eq("id", record.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    record.checker_by
      ? supabase.from("profiles").select("full_name").eq("id", record.checker_by).maybeSingle()
      : Promise.resolve({ data: null }),
    record.reviewed_by
      ? supabase.from("profiles").select("full_name").eq("id", record.reviewed_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const assignerName = assignerProfile?.data?.full_name ?? "—";
  const checkerName = checkerProfile?.data?.full_name ?? "—";
  const reviewerName = reviewerProfile?.data?.full_name ?? "—";

  // Round 1 -> Round 2 distinctness (20 Sept 2026) — a System Admin is
  // exempt (matches the DB trigger and the app-level check in
  // reviewQcRound2()); everyone else who made the Round 1 decision is
  // blocked from also being its Round 2 reviewer, with an explanation
  // instead of just hiding the form.
  const isSystemAdmin = user.roles.includes("system_admin");
  // Test results (0119): the COA template's tests for the Round 1 form, and the decision history.
  const template =
    record.status === "submitted" && canRound1
      ? await loadQcTemplate(supabase, record)
      : { needsResults: false, lines: [], addHref: null };
  const { data: historyRows } = await supabase
    .from("qc_decision_history")
    .select("id, event, reason, results, results_edited, decided_by, decided_at")
    .eq("quality_check_id", record.id)
    .order("decided_at", { ascending: true })
    .order("id", { ascending: true });
  type HistoryRow = { id: string; event: string; reason: string; results: QcResultLine[] | null; results_edited: boolean; decided_by: string | null; decided_at: string };
  const history = (historyRows ?? []) as unknown as HistoryRow[];
  const { data: historyPeople } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", [...new Set(history.map((h) => h.decided_by).filter((x): x is string => !!x))]);
  const personName = new Map((historyPeople ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? "—"]));
  const final = finalResults(record);
  const canVoid = canWrite(user.roles, "qc_void_rejection");
  const rounds = qcRoundOutcomes(record);
  const isSameAsChecker = record.checker_by != null && record.checker_by === user.id && !isSystemAdmin;

  return (
    <div>
      <PageHeader
        title={record.ar_number}
        description={record.items ? `${record.items.item_code} — ${record.items.name}` : undefined}
        action={
          <div className="flex items-center gap-2">
            <AuditHistoryLink recordId={record.id} roles={user?.roles ?? []} />
            {record.is_legacy && <LegacyTag show />}
            {record.is_retest && <Badge status="pending">Retest</Badge>}
            <Badge status={record.status}>{qcRecordStatusLabel(record.status)}</Badge>
          </div>
        }
      />

      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader title="Assign record" />
          <CardBody className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="Analytical Report No." value={record.ar_number} />
            <Field label="Batch" value={<>{batchLabel}<LegacyTag show={record.purchase_lines?.is_legacy} /></>} />
            <Field
              label="Sample quantity"
              value={record.sample_qty !== null ? `${formatQty(record.sample_qty)} ${record.sample_unit ?? ""}` : "—"}
            />
            <Field label="Assigned by" value={assignerName} />
          </CardBody>
        </Card>

        {/* Round 1 — QC Checker */}
        {record.status === "submitted" && canRound1 && (
          <Card>
            <CardHeader title="Round 1 decision — QC Checker" />
            <CardBody>
              <QcCheckerForm id={record.id} needsResults={template.needsResults} lines={template.lines} addHref={template.addHref} />
            </CardBody>
          </Card>
        )}

        {record.status === "submitted" && !canRound1 && (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">Awaiting Round 1 review — you don&apos;t have the QC Checker role.</p>
            </CardBody>
          </Card>
        )}

        {/* Once Round 1 has happened, show its decision read-only — from
            Round 1's own fields (ACC-24), not the record's final status. */}
        {rounds.round1 !== "pending" && (
          <Card>
            <CardHeader title="Round 1 decision — QC Checker" />
            <CardBody className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field
                label="Decision"
                value={
                  rounds.round1 === "not_recorded" ? (
                    "Not recorded (decided in the earlier single-step review)"
                  ) : (
                    <Badge status={record.status === "checker_rejected" ? "checker_rejected" : rounds.round1}>
                      {record.status === "checker_rejected" ? "Rejection proposed" : rounds.round1 === "rejected" ? "Rejected" : "Approved"}
                    </Badge>
                  )
                }
              />
              <Field label="Decided by" value={checkerName} />
              <Field label="Decided at" value={formatDate(record.checker_at)} />
              <div className="col-span-2">
                <p className="text-xs font-medium text-muted uppercase tracking-wide">Reason</p>
                <p className="mt-1 whitespace-pre-wrap">{record.checker_comments || "—"}</p>
              </div>
              {record.checker_results && (
                <div className="col-span-2">
                  <p className="mb-1 text-xs font-medium text-muted uppercase tracking-wide">Test results recorded in Round 1</p>
                  <ResultsTable lines={record.checker_results} />
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* A proposed rejection waits for the QC Reviewer: confirm it, or send it back. */}
        {record.status === "checker_rejected" && canRound2 && !isSameAsChecker && (
          <Card>
            <CardHeader title="Round 2 — QC Reviewer: confirm or send back" />
            <CardBody>
              <ProposedRejectionForm id={record.id} />
            </CardBody>
          </Card>
        )}
        {record.status === "checker_rejected" && canRound2 && isSameAsChecker && (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">
                You proposed this rejection — a different QC Reviewer must confirm it or send it back.
              </p>
            </CardBody>
          </Card>
        )}
        {record.status === "checker_rejected" && !canRound2 && (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">
                Rejection proposed — a QC Reviewer will confirm it or send it back. The batch stays on hand until then.
              </p>
            </CardBody>
          </Card>
        )}

        {/* Round 2 — QC Reviewer, only reachable once Round 1 has approved. */}
        {record.status === "checker_approved" && canRound2 && !isSameAsChecker && (
          <Card>
            <CardHeader title="Round 2 decision — QC Reviewer" />
            <CardBody>
              <QcReviewerForm
                id={record.id}
                round1Results={record.checker_results}
                maxRetestDays={MAX_RM_RETEST_DAYS}
                defaultRetestDays={MAX_RM_RETEST_DAYS}
                isFinalRetest={isFinalRetest}
                defaultExpiry={suggestedExpiry ?? ""}
                maxExpiry={maxExpiry}
              />
            </CardBody>
          </Card>
        )}

        {record.status === "checker_approved" && canRound2 && isSameAsChecker && (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">
                You made the Round 1 decision — a different QC Reviewer must make the final decision.
              </p>
            </CardBody>
          </Card>
        )}

        {record.status === "checker_approved" && !canRound2 && (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">Awaiting final review — you don&apos;t have the QC Reviewer role.</p>
            </CardBody>
          </Card>
        )}

        {/* Once Round 2 has happened, show its decision read-only. A Round 1
            rejection never reaches Round 2 (ACC-24). */}
        {rounds.round1 === "rejected" && record.status === "rejected" && (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">Rejected at Round 1 — no QC Reviewer decision was needed.</p>
            </CardBody>
          </Card>
        )}
        {(rounds.round2 === "approved" || rounds.round2 === "rejected") && (
          <Card>
            <CardHeader title="Round 2 decision — QC Reviewer" />
            <CardBody className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Decision" value={<Badge status={record.status}>{record.status}</Badge>} />
              <Field label="Decided by" value={reviewerName} />
              <Field label="Decided at" value={formatDate(record.reviewed_at)} />
              <Field label="Expiry date" value={formatDate(record.expiry_date)} />
              <Field label="Retest period (days)" value={record.retest_period_days ?? "—"} />
              <Field label="Retest date" value={record.retest_date ? formatDate(record.retest_date) : record.status === "approved" ? "None (last retest done)" : "—"} />
              <div className="col-span-2">
                <p className="text-xs font-medium text-muted uppercase tracking-wide">Reason</p>
                <p className="mt-1 whitespace-pre-wrap">{record.review_comments || "—"}</p>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Final test results: the Reviewer's list when he edited any, otherwise Round 1's. */}
        {final && (rounds.round2 === "approved" || rounds.round2 === "rejected") && (
          <Card>
            <CardHeader title="Final test results" />
            <CardBody className="flex flex-col gap-3 text-sm">
              <p className="text-muted">
                {record.reviewer_results
                  ? "The QC Reviewer edited the results, so his list is final and goes on the Certificate of Analysis. Changed results are highlighted, with Round 1's value beside them."
                  : "The QC Reviewer made no change, so the Quality Checker's Round 1 results stand and go on the Certificate of Analysis."}
              </p>
              <ResultsTable lines={final} compare={record.reviewer_results ? record.checker_results : null} />
            </CardBody>
          </Card>
        )}

        {record.status === "rejected" && canVoid && (
          <Card>
            <CardHeader title="Void this rejection" />
            <CardBody>
              <VoidRejectionForm id={record.id} />
            </CardBody>
          </Card>
        )}

        {history.length > 0 && (
          <Card>
            <CardHeader title="Decision history" />
            <CardBody className="flex flex-col gap-4 text-sm">
              {history.map((h) => (
                <div key={h.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <p className="font-medium">{QC_EVENT_LABELS[h.event] ?? h.event}</p>
                  <p className="text-xs text-muted">
                    {h.decided_by ? personName.get(h.decided_by) ?? "—" : "—"} · {formatDateTime(h.decided_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{h.reason}</p>
                  {h.results && (
                    <div className="mt-2">
                      <p className="mb-1 text-xs text-muted">{h.results_edited ? "Results edited by the Reviewer" : "Results recorded"}</p>
                      <ResultsTable lines={h.results} />
                    </div>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}

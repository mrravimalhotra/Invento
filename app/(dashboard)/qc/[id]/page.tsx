import { qcRoundOutcomes } from "@/lib/qc-rounds";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatQty, fpBatchBoth } from "@/lib/utils";
import { qcRecordStatusLabel } from "@/lib/batch-qc-status";
import { MAX_RM_RETESTS, MAX_RM_RETEST_DAYS } from "@/lib/constants/qc-rules";
import { QcCheckerForm } from "./qc-checker-form";
import { QcReviewerForm } from "./qc-reviewer-form";

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
  purchase_line_id: string | null;
  production_batch_id: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  items: { item_code: string; name: string } | null;
  purchase_lines: { batch_number: string; quantity: string | number; unit: string } | null;
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
      "id, ar_number, status, sample_qty, sample_unit, expiry_date, checker_comments, checker_by, checker_at, review_comments, retest_period_days, retest_date, is_retest, purchase_line_id, production_batch_id, created_by, reviewed_by, reviewed_at, items(item_code, name), purchase_lines(batch_number, quantity, unit), finished_product_batches(batch_number, short_batch_no), production_issue_batches(batch_number)"
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
  // FB-0058 / FB-0061 (3 Oct 2026): a raw-material batch is retested at most 3
  // times. On the 3rd retest the Reviewer sets only the Expiry date; the batch is
  // then usable until that date. A retest also starts from the previous expiry.
  const isRawMaterialQc = !!(record.purchase_line_id || record.production_batch_id);
  let isFinalRetest = false;
  let suggestedExpiry = record.expiry_date;
  if (record.status === "checker_approved" && isRawMaterialQc && record.is_retest) {
    const col = record.purchase_line_id ? "purchase_line_id" : "production_batch_id";
    const batchId = (record.purchase_line_id ?? record.production_batch_id) as string;
    const { count } = await supabase
      .from("quality_checks")
      .select("id", { count: "exact", head: true })
      .eq(col, batchId)
      .eq("is_retest", true);
    isFinalRetest = (count ?? 0) >= MAX_RM_RETESTS;
    const { data: prev } = await supabase
      .from("quality_checks")
      .select("expiry_date")
      .eq(col, batchId)
      .neq("id", record.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1);
    suggestedExpiry = prev?.[0]?.expiry_date ?? null;
  }
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
  const rounds = qcRoundOutcomes(record);
  const isSameAsChecker = record.checker_by != null && record.checker_by === user.id && !isSystemAdmin;

  return (
    <div>
      <PageHeader
        title={record.ar_number}
        description={record.items ? `${record.items.item_code} — ${record.items.name}` : undefined}
        action={
          <div className="flex items-center gap-2">
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
            <Field label="Batch" value={batchLabel} />
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
              <QcCheckerForm id={record.id} />
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
                    <Badge status={rounds.round1}>{rounds.round1 === "rejected" ? "Rejected" : "Approved"}</Badge>
                  )
                }
              />
              <Field label="Decided by" value={checkerName} />
              <Field label="Decided at" value={formatDate(record.checker_at)} />
              <div className="col-span-2">
                <p className="text-xs font-medium text-muted uppercase tracking-wide">Comments</p>
                <p className="mt-1 whitespace-pre-wrap">{record.checker_comments || "—"}</p>
              </div>
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
                maxRetestDays={isRawMaterialQc ? MAX_RM_RETEST_DAYS : undefined}
                defaultRetestDays={isRawMaterialQc ? MAX_RM_RETEST_DAYS : undefined}
                isFinalRetest={isFinalRetest}
                defaultExpiry={suggestedExpiry ?? ""}
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
        {rounds.round1 === "rejected" && (
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
                <p className="text-xs font-medium text-muted uppercase tracking-wide">Comments</p>
                <p className="mt-1 whitespace-pre-wrap">{record.review_comments || "—"}</p>
              </div>
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

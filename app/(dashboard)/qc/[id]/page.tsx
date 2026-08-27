import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import { QcReviewForm } from "./qc-review-form";

type QcDetail = {
  id: string;
  ar_number: string;
  status: string;
  sample_qty: string | number | null;
  sample_unit: string | null;
  expiry_date: string | null;
  review_comments: string | null;
  retest_period_days: number | null;
  retest_date: string | null;
  reviewed_at: string | null;
  items: { item_code: string; name: string } | null;
  purchase_lines: { batch_number: string; quantity: string | number; unit: string } | null;
  finished_product_batches: { batch_number: string } | null;
};

export default async function QualityCheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("quality_checks")
    .select(
      "id, ar_number, status, sample_qty, sample_unit, expiry_date, review_comments, retest_period_days, retest_date, reviewed_at, items(item_code, name), purchase_lines(batch_number, quantity, unit), finished_product_batches(batch_number)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const record = data as unknown as QcDetail;
  const batchLabel = record.purchase_lines?.batch_number ?? record.finished_product_batches?.batch_number ?? "—";
  const canReview = canWrite(user.roles, "qc_review");

  return (
    <div>
      <PageHeader
        title={record.ar_number}
        description={record.items ? `${record.items.item_code} — ${record.items.name}` : undefined}
        action={<Badge status={record.status}>{record.status}</Badge>}
      />

      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader title="Assign record" />
          <CardBody className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="AR number" value={record.ar_number} />
            <Field label="Batch" value={batchLabel} />
            <Field
              label="Sample quantity"
              value={record.sample_qty !== null ? `${formatNumber(record.sample_qty)} ${record.sample_unit ?? ""}` : "—"}
            />
            <Field label="Expiry date" value={formatDate(record.expiry_date)} />
          </CardBody>
        </Card>

        {record.status === "submitted" && canReview && (
          <Card>
            <CardHeader title="Review decision" />
            <CardBody>
              <QcReviewForm id={record.id} />
            </CardBody>
          </Card>
        )}

        {record.status === "submitted" && !canReview && (
          <Card>
            <CardBody>
              <p className="text-sm text-muted">Awaiting review — you don&apos;t have the QC Reviewer role.</p>
            </CardBody>
          </Card>
        )}

        {record.status !== "submitted" && (
          <Card>
            <CardHeader title="Review decision" />
            <CardBody className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Decision" value={<Badge status={record.status}>{record.status}</Badge>} />
              <Field label="Reviewed at" value={formatDate(record.reviewed_at)} />
              <Field label="Retest period (days)" value={record.retest_period_days ?? "—"} />
              <Field label="Retest date" value={formatDate(record.retest_date)} />
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

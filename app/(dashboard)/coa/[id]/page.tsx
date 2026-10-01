import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { CoaPdfButton } from "../coa-pdf-button";
import type { HeaderField, ResultLine } from "@/lib/actions/coa";

export default async function CoaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("coa_records")
    .select(
      "id, coa_number, issued_at, file_url, coa_type, header_data, result_lines, remarks, quality_checks(ar_number, items(item_code, name), purchase_lines(batch_number)), finished_product_batches(batch_number)"
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      coa_number: string;
      issued_at: string;
      file_url: string | null;
      coa_type: string | null;
      header_data: HeaderField[] | null;
      result_lines: ResultLine[] | null;
      remarks: string | null;
      quality_checks: {
        ar_number: string;
        items: { item_code: string; name: string } | null;
        purchase_lines: { batch_number: string } | null;
      } | null;
      finished_product_batches: { batch_number: string } | null;
    }>();

  if (!row) notFound();

  const batchLabel = row.quality_checks?.purchase_lines?.batch_number ?? row.finished_product_batches?.batch_number ?? "—";
  const itemLabel = row.quality_checks?.items ? `${row.quality_checks.items.item_code} — ${row.quality_checks.items.name}` : "—";

  return (
    <div>
      <Link href="/coa" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Certificate of Analysis
      </Link>
      <PageHeader
        title={row.coa_number}
        description={`Issued ${formatDateTime(row.issued_at)} · Analytical Report No. ${row.quality_checks?.ar_number ?? "—"} · ${itemLabel} · Batch ${batchLabel}`}
        action={
          row.coa_type && row.header_data && row.result_lines ? (
            <CoaPdfButton
              data={{
                coaNumber: row.coa_number,
                subjectType: row.coa_type as "raw_material" | "finished_product",
                headerFields: row.header_data,
                resultLines: row.result_lines,
                remarks: row.remarks ?? "",
              }}
            />
          ) : null
        }
      />

      {!row.coa_type ? (
        <Card>
          <CardBody className="text-sm text-muted">
            This certificate was created via the old file-link flow and has no in-app preview.{" "}
            {row.file_url && (
              <a href={row.file_url} target="_blank" rel="noreferrer" className="text-brand-dark hover:underline">
                Open the linked file
              </a>
            )}
          </CardBody>
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardHeader title="Certificate header" />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {(row.header_data ?? []).map((f) => (
                  <div key={f.label} className="flex gap-2 text-sm">
                    <dt className="w-36 shrink-0 font-medium text-muted">{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card className="mb-4">
            <CardHeader title="Test results" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-5 py-2 w-14">S.N.</th>
                    <th className="px-5 py-2">Test</th>
                    <th className="px-5 py-2">Specification</th>
                    <th className="px-5 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(row.result_lines ?? []).map((l) => (
                    <tr key={l.seq}>
                      <td className="px-5 py-2.5 text-muted">{l.seq}.</td>
                      <td className="px-5 py-2.5">{l.test}</td>
                      <td className="px-5 py-2.5 text-muted">{l.specification}</td>
                      <td className="px-5 py-2.5 font-medium">{l.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {row.remarks && (
            <Card>
              <CardHeader title="Remarks" />
              <CardBody className="text-sm">{row.remarks}</CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

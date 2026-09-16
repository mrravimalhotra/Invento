import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { SignatureBlock } from "@/components/ui/signature-block";
import { formatDate, formatNumber } from "@/lib/utils";
import { COMPANY_NAME, COMPANY_ADDRESS, MFG_LIC_NO } from "@/lib/pdf";
import { MfrPdfButton, type MfrPdfData } from "./mfr-pdf-button";

export default async function MfrReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: def } = await supabase
    .from("mfr_definitions")
    .select(
      "id, code, name, batch_size_qty, batch_size_unit, version, approved_by, approved_at, procedure_intro, theoretical_yield_pct, permissible_yield_pct, items:finished_product_item_id(item_code, item_types(description))"
    )
    .eq("id", id)
    .maybeSingle();
  if (!def) notFound();

  const [{ data: lines }, approverProfile, { data: procedureSteps }] = await Promise.all([
    supabase
      .from("mfr_lines")
      .select("id, quantity, unit, items(item_code, name)")
      .eq("mfr_definition_id", id)
      .eq("version", def.version)
      .order("id"),
    def.approved_by
      ? supabase.from("profiles").select("full_name").eq("id", def.approved_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("mfr_procedure_steps")
      .select("id, step_no, stage, operation")
      .eq("mfr_definition_id", id)
      .order("step_no"),
  ]);

  type LineRow = { id: string; quantity: string | number; unit: string; items: { item_code: string; name: string } | null };
  const lineRows = (lines ?? []) as unknown as LineRow[];
  type ProcedureStepRow = { id: string; step_no: number; stage: string; operation: string };
  const stepRows = (procedureSteps ?? []) as unknown as ProcedureStepRow[];
  const finishedProduct = def.items as unknown as { item_code: string; item_types: { description: string } | null } | null;
  const itemType = finishedProduct?.item_types?.description ?? "—";
  const approvedByName = approverProfile?.data?.full_name ?? null;
  // Same yield-line assembly as the detail page — only print the parts
  // that are actually filled in, and skip the whole line if neither is.
  const yieldLine =
    def.theoretical_yield_pct != null || def.permissible_yield_pct != null
      ? [
          def.theoretical_yield_pct != null ? `Theoretical Yield = ${formatNumber(def.theoretical_yield_pct)}%` : null,
          def.permissible_yield_pct != null ? `Permissible yield = NLT ${formatNumber(def.permissible_yield_pct)}%` : null,
        ]
          .filter(Boolean)
          .join("    ")
      : null;

  const pdfData: MfrPdfData = {
    code: def.code,
    name: def.name,
    version: def.version,
    batchSizeQty: def.batch_size_qty,
    batchSizeUnit: def.batch_size_unit,
    finishedProductCode: finishedProduct?.item_code ?? null,
    itemType,
    approvedByName,
    approvedAt: def.approved_at ? formatDate(def.approved_at) : null,
    lines: lineRows.map((l) => ({
      itemLabel: l.items ? `${l.items.item_code} · ${l.items.name}` : "—",
      quantity: formatNumber(l.quantity),
      unit: l.unit,
    })),
    procedureIntro: def.procedure_intro,
    procedureSteps: stepRows.map((s) => ({ stepNo: s.step_no, stage: s.stage, operation: s.operation })),
    yieldLine,
  };

  return (
    <div>
      <PageHeader
        title={`Print preview · ${def.code}`}
        description="Master Formula Record — matches the PDF export."
        action={
          <div className="flex gap-2">
            <LinkButton href={`/mfr/${id}`} variant="secondary">
              Back
            </LinkButton>
            <MfrPdfButton data={pdfData} />
          </div>
        }
      />

      <Card>
        <CardBody>
          <div className="border-b border-brand pb-2">
            <p className="text-lg font-semibold text-brand-dark">{COMPANY_NAME}</p>
            <p className="text-xs text-muted">
              {COMPANY_ADDRESS} · Mfg. Lic. No.: {MFG_LIC_NO}
            </p>
          </div>
          <h2 className="mt-3 text-base font-semibold">
            Master Formula Record — {def.code} (v{def.version})
          </h2>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted">Product name:</span> {def.name}
            </p>
            <p>
              <span className="text-muted">Finished product code:</span> {finishedProduct?.item_code ?? "—"}
            </p>
            <p>
              <span className="text-muted">Item type:</span> {itemType}
            </p>
            <p>
              <span className="text-muted">Batch size:</span> {formatNumber(def.batch_size_qty)} {def.batch_size_unit}
            </p>
            <p>
              <span className="text-muted">Approval:</span>{" "}
              {approvedByName ? `${approvedByName} on ${formatDate(def.approved_at)}` : "Not approved"}
            </p>
          </div>

          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">Unit</th>
              </tr>
            </thead>
            <tbody>
              {lineRows.map((l, i) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{l.items ? `${l.items.item_code} · ${l.items.name}` : "—"}</td>
                  <td className="px-3 py-2">{formatNumber(l.quantity)}</td>
                  <td className="px-3 py-2">{l.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(def.procedure_intro || stepRows.length > 0 || yieldLine) && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Manufacturing Procedure</h3>
              {def.procedure_intro && <p className="mt-2 text-sm">{def.procedure_intro}</p>}
              {stepRows.length > 0 && (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      <th className="px-3 py-2 w-12">Sr.No</th>
                      <th className="px-3 py-2 w-48">Stage</th>
                      <th className="px-3 py-2">Operation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stepRows.map((s) => (
                      <tr key={s.id} className="border-b border-border last:border-0 align-top">
                        <td className="px-3 py-2">{s.step_no}.</td>
                        <td className="px-3 py-2 font-medium">{s.stage}</td>
                        <td className="px-3 py-2 whitespace-pre-wrap">{s.operation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {yieldLine && <p className="mt-3 text-sm">{yieldLine}</p>}
            </div>
          )}

          <SignatureBlock />
        </CardBody>
      </Card>
    </div>
  );
}

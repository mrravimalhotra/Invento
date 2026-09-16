import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import { ApproveForm } from "./approve-form";
import { EditRecipeForm } from "./edit-recipe-form";
import { EditProcedureForm } from "./edit-procedure-form";
import { DeleteMfrForm } from "./delete-mfr-form";
import { ToggleMfrActiveForm } from "./toggle-active-form";
import { PrintMfrButton } from "./print-mfr-button";
import type { EditableLine } from "../mfr-line-editor";
import type { EditableStep } from "../mfr-procedure-editor";
import { mfrDocxFilename, type MfrDocxData } from "./mfr-docx";

export default async function MfrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);

  const { data: def } = await supabase
    .from("mfr_definitions")
    .select(
      "id, code, name, batch_size_qty, batch_size_unit, version, approved_by, approved_at, active, procedure_intro, theoretical_yield_pct, permissible_yield_pct, items:finished_product_item_id(id, item_code, name, item_types(description))"
    )
    .eq("id", id)
    .maybeSingle();

  if (!def) notFound();

  const [{ data: lines }, { data: rawItems }, approverProfile, { data: procedureSteps }] = await Promise.all([
    supabase
      .from("mfr_lines")
      // botanical_alias added 16 Sept 2026 for the "Print MFR" .docx
      // download's Botanical Name column (mfr-docx.ts) — the column
      // itself already existed on items, just wasn't selected here
      // before.
      .select("id, quantity, unit, items(id, item_code, name, unit, botanical_alias)")
      .eq("mfr_definition_id", id)
      .eq("version", def.version)
      .order("id"),
    supabase
      .from("items")
      .select("id, item_code, name, unit")
      .eq("category", "raw")
      .eq("active", true)
      .order("created_at", { ascending: false }),
    def.approved_by
      ? supabase.from("profiles").select("full_name").eq("id", def.approved_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("mfr_procedure_steps")
      .select("id, step_no, stage, operation")
      .eq("mfr_definition_id", id)
      .order("step_no"),
  ]);

  const canEdit = canWrite(user?.roles ?? [], "mfr");
  const isSystemAdmin = (user?.roles ?? []).includes("system_admin");
  const finishedProduct = def.items as unknown as {
    id: string;
    item_code: string;
    name: string;
    item_types: { description: string } | null;
  } | null;
  const itemType = finishedProduct?.item_types?.description;
  // As of 0041_mfr_deferred_approval.sql, an unapproved MFR normally has
  // no linked item yet at all — that's the expected, common case now, not
  // just a legacy-data edge case. Only an *approved* MFR with no link is
  // the old "predates the link" situation (approved before
  // finished_product_item_id existed, or before this deferral shipped and
  // somehow never got one — shouldn't happen going forward, but the
  // message stays accurate if it's ever seen).
  const noItemReason = def.approved_by ? "created before this MFR/item link existed" : "created on approval";

  type LineRow = {
    id: string;
    quantity: string | number;
    unit: string;
    items: { id: string; item_code: string; name: string; unit: string | null; botanical_alias: string | null } | null;
  };
  const lineRows = (lines ?? []) as unknown as LineRow[];

  const initialLines: EditableLine[] = lineRows.map((l) => ({
    itemId: l.items?.id ?? "",
    quantity: String(l.quantity),
    unit: l.unit,
  }));

  type ProcedureStepRow = { id: string; step_no: number; stage: string; operation: string };
  const stepRows = (procedureSteps ?? []) as unknown as ProcedureStepRow[];
  const hasProcedure = stepRows.length > 0 || !!def.procedure_intro;
  const initialSteps: EditableStep[] = stepRows.map((s) => ({ stage: s.stage, operation: s.operation }));

  // Ravi (16 Sept 2026): "Print MFR option should give me .docx document
  // in attached format... pick up data already entered as part of MFR
  // and recipe" — see mfr-docx.ts. Falls back to the same auto-generated
  // intro line the procedure card would show if procedure_intro was never
  // overridden, so the printed document reads correctly even for an MFR
  // whose procedure intro was left at its default.
  const mfrDocxData: MfrDocxData = {
    productName: def.name,
    batchSizeQty: def.batch_size_qty,
    batchSizeUnit: def.batch_size_unit,
    formulaLines: lineRows.map((l) => ({
      ingredient: l.items?.name ?? "—",
      botanicalName: l.items?.botanical_alias ?? null,
      qty: l.quantity,
      unit: l.unit,
    })),
    procedureIntro:
      def.procedure_intro ??
      (hasProcedure
        ? `Weigh/measure all raw materials at production level. (Batch size ${formatNumber(def.batch_size_qty)} ${def.batch_size_unit})`
        : null),
    procedureSteps: stepRows.map((s) => ({ stage: s.stage, operation: s.operation })),
    theoreticalYieldPct: def.theoretical_yield_pct,
    permissibleYieldPct: def.permissible_yield_pct,
  };

  return (
    <div>
      <PageHeader
        title={`${def.code} · ${def.name}`}
        description={finishedProduct ? finishedProduct.item_code : `No Finished Product item — ${noItemReason}`}
        action={<PrintMfrButton data={mfrDocxData} filename={mfrDocxFilename(def.name)} />}
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader title="Header" />
          <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between sm:block">
              <span className="text-muted">Code</span>
              <span className="sm:block sm:mt-1 font-medium">{def.code}</span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-muted">Name</span>
              <span className="sm:block sm:mt-1 font-medium">{def.name}</span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-muted">Batch size</span>
              <span className="sm:block sm:mt-1 font-medium">
                {formatNumber(def.batch_size_qty)} {def.batch_size_unit}
              </span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-muted">Finished product</span>
              <span className="sm:block sm:mt-1 font-medium">
                {finishedProduct ? (
                  <Link href={`/items/${finishedProduct.id}`} className="text-brand hover:underline">
                    {finishedProduct.item_code} · {finishedProduct.name}
                  </Link>
                ) : (
                  `— (${noItemReason})`
                )}
              </span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-muted">Item type</span>
              <span className="sm:block sm:mt-1 font-medium">{itemType ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 sm:col-span-2 border-t border-border pt-3">
              <div>
                <span className="text-muted">Approval</span>
                <div className="mt-1">
                  {def.approved_by ? (
                    <Badge status="approved">
                      Approved by {approverProfile?.data?.full_name ?? "—"} on {formatDate(def.approved_at)}
                    </Badge>
                  ) : (
                    <Badge status="not_submitted">Not approved</Badge>
                  )}
                </div>
              </div>
              {!def.approved_by && canEdit && <ApproveForm mfrId={id} />}
            </div>
            <div className="flex items-center justify-between gap-3 sm:col-span-2 border-t border-border pt-3">
              <div>
                <span className="text-muted">Status</span>
                <div className="mt-1">
                  <Badge status={def.active ? "approved" : "not_submitted"}>{def.active ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
              {canEdit && <ToggleMfrActiveForm id={id} active={def.active} />}
            </div>
            {isSystemAdmin && (
              <div className="flex justify-end sm:col-span-2 border-t border-border pt-3">
                <DeleteMfrForm id={id} code={def.code} name={def.name} />
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recipe" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5">Quantity</th>
                    <th className="px-4 py-2.5">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {lineRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-muted">
                        No recipe lines yet.
                      </td>
                    </tr>
                  )}
                  {lineRows.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">
                        {l.items ? `${l.items.item_code} · ${l.items.name}` : "—"}
                      </td>
                      <td className="px-4 py-2.5">{formatNumber(l.quantity)}</td>
                      <td className="px-4 py-2.5">{l.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Ravi (14 Sept 2026): "for now MFR edit option should only
                available before approval. Post approval edit should be
                not allowed." Once approved, the recipe is locked — no
                edit panel, just an explanation of why and what to do
                instead, same pattern as deleteMfrDefinition()'s FK-
                violation message pointing at Deactivate. */}
            {canEdit && !def.approved_by && (
              <div className="border-t border-border p-4">
                <EditRecipeForm mfrId={id} rawItems={rawItems ?? []} initialLines={initialLines} />
              </div>
            )}
            {canEdit && def.approved_by && (
              <p className="border-t border-border p-4 text-xs text-muted">
                This recipe is locked — approved MFRs can&apos;t be edited. Deactivate this MFR and create a new one
                if the recipe needs to change.
              </p>
            )}
          </CardBody>
        </Card>

        {/* Ravi (16 Sept 2026), via a sample Master Formula Record Word
            document: the manufacturing procedure (Sr.No / Stage /
            Operation steps, an intro line, a closing yield line) — see
            0048_mfr_procedure.sql and docs/modules/mfr.md. Optional:
            shows an empty-state + "Add procedure" when nothing's been
            entered yet, rather than an empty table. Editable at any
            time, including after approval — unlike the recipe above,
            there's no lock here. */}
        <Card>
          <CardHeader title="Manufacturing Procedure" />
          <CardBody className="flex flex-col gap-4">
            {!hasProcedure ? (
              <p className="text-sm text-muted">No manufacturing procedure entered yet.</p>
            ) : (
              <>
                {def.procedure_intro && <p className="text-sm">{def.procedure_intro}</p>}
                {stepRows.length > 0 && (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm">
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
                            <td className="px-3 py-2.5">{s.step_no}.</td>
                            <td className="px-3 py-2.5 font-medium">{s.stage}</td>
                            <td className="px-3 py-2.5 whitespace-pre-wrap">{s.operation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(def.theoretical_yield_pct != null || def.permissible_yield_pct != null) && (
                  <p className="text-sm">
                    {def.theoretical_yield_pct != null && `Theoretical Yield = ${formatNumber(def.theoretical_yield_pct)}%`}
                    {def.theoretical_yield_pct != null && def.permissible_yield_pct != null && "    "}
                    {def.permissible_yield_pct != null && `Permissible yield = NLT ${formatNumber(def.permissible_yield_pct)}%`}
                  </p>
                )}
              </>
            )}
            {canEdit && (
              <div>
                <EditProcedureForm
                  mfrId={id}
                  hasProcedure={hasProcedure}
                  initialIntro={def.procedure_intro ?? ""}
                  initialTheoreticalYieldPct={def.theoretical_yield_pct != null ? String(def.theoretical_yield_pct) : ""}
                  initialPermissibleYieldPct={def.permissible_yield_pct != null ? String(def.permissible_yield_pct) : ""}
                  initialSteps={initialSteps}
                />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

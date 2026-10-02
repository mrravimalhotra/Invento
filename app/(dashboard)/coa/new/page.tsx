import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { canWrite } from "@/lib/constants/roles";
import { isLegacyCode, formatDate, formatQty, fpBatchBoth, fpBatchShort } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { SubjectBatchPicker, type BatchOption } from "./subject-batch-picker";
import { GenerateCoaForm, type TemplateLine } from "./generate-coa-form";
import type { HeaderField } from "@/lib/actions/coa";

type Subject = "raw_material" | "finished_product";

export default async function NewCoaPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; quality_check_id?: string }>;
}) {
  const params = await searchParams;
  const subject: Subject | "" = params.subject === "raw_material" || params.subject === "finished_product" ? params.subject : "";
  const qualityCheckId = params.quality_check_id ?? "";

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "coa")) redirect("/coa");

  const supabase = await createClient();

  const batches: BatchOption[] = subject ? await fetchBatchOptions(supabase, subject) : [];

  let templateLines: TemplateLine[] | null = null;
  let headerFields: HeaderField[] | null = null;
  let noTemplateFor: string | null = null;
  // Ravi (22 Sept 2026): picking Finished Product + a batch silently showed
  // nothing at all — no form, no error. Root cause was that resolveRawMaterial/
  // resolveFinishedProduct returned a bare `null` on any failure (query error,
  // a broken FK chain, or a genuinely missing Item Type), and the page simply
  // rendered nothing for that case. Now every failure carries a reason the
  // page always shows, so "nothing happens" can't recur even if some other
  // batch hits a different failure mode later.
  let resolveError: string | null = null;

  // ACC-15: a link (or an old tab) may carry an AR that is no longer the
  // batch's current approval — say so instead of offering a form that would
  // be refused on save.
  if (subject && qualityCheckId && !batches.some((b) => b.qualityCheckId === qualityCheckId)) {
    resolveError =
      "This AR is no longer the batch's current QC approval (the batch was retested, rejected or is due for retest), so a COA can't be issued against it. Pick a batch from the list.";
  } else if (subject && qualityCheckId) {
    const resolved = subject === "raw_material"
      ? await resolveRawMaterial(supabase, qualityCheckId)
      : await resolveFinishedProduct(supabase, qualityCheckId);

    if (!resolved.ok) {
      resolveError = resolved.reason;
    } else {
      const { data: template } = await supabase
        .from("coa_templates")
        .select("id, coa_template_lines(seq, test, specification)")
        .eq("item_type_id", resolved.itemTypeId)
        .maybeSingle();

      if (!template || template.coa_template_lines.length === 0) {
        noTemplateFor = resolved.itemTypeDescription;
      } else {
        templateLines = template.coa_template_lines
          .slice()
          .sort((a, b) => a.seq - b.seq)
          .map((l) => ({ seq: l.seq, test: l.test, specification: l.specification }));
        headerFields = resolved.headerFields;
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="New Certificate of Analysis"
        description="Pick a subject and a batch that has cleared QC — its Item Type determines which template the certificate is generated from."
        action={
          <Link href="/coa/templates" className="text-sm text-brand hover:underline">
            Manage Templates
          </Link>
        }
      />

      <Card className="mb-4">
        <CardBody>
          <SubjectBatchPicker subject={subject} qualityCheckId={qualityCheckId} batches={batches} />
        </CardBody>
      </Card>

      {resolveError && (
        <Card>
          <CardBody className="text-sm text-red">{resolveError}</CardBody>
        </Card>
      )}

      {noTemplateFor && (
        <Card>
          <CardBody className="text-sm text-muted">
            No COA template is defined yet for Item Type &quot;{noTemplateFor}&quot; —{" "}
            <Link href="/coa/templates" className="text-brand hover:underline">
              add one on Manage Templates
            </Link>{" "}
            before a certificate can be generated for this batch.
          </CardBody>
        </Card>
      )}

      {templateLines && headerFields && subject && (
        <Card>
          <CardBody>
            <GenerateCoaForm
              subjectType={subject}
              qualityCheckId={qualityCheckId}
              initialHeaderFields={headerFields}
              templateLines={templateLines}
              // Ravi (22 Sept 2026): the sample certificates' closing line reads
              // "complies/Not complies as per IHS" (a template the QC person
              // edits per certificate — the slash isn't a typo, it's "delete
              // whichever doesn't apply"), not the fuller "complies as per
              // In-House Specification" wording this pre-filled. Same default
              // for both Raw Material and Finished Product, as before — this is
              // the one and only call site regardless of subject.
              defaultRemarks="The above sample complies/Not complies as per IHS."
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ACC-15 (29 Sept 2026): only a batch's CURRENT approval can be certified —
// the latest QC record for the batch, approved, and (for raw material) not
// past its retest date. Before, every QC record that had ever been approved
// was offered, so a COA could quote an approval the batch no longer has
// (rejected on retest, retest in progress, or due for retest).
// current_qc_approvals (0082) applies that rule; the database also refuses
// a COA for any other QC record.
async function fetchCurrentApprovalIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subject: Subject
): Promise<Set<string>> {
  const column = subject === "raw_material" ? "purchase_line_id" : "finished_product_batch_id";
  const { data } = await fetchAllRows((from, to) =>
    supabase
      .from("current_qc_approvals")
      .select("quality_check_id")
      .not(column, "is", null)
      .order("quality_check_id", { ascending: true })
      .range(from, to)
      .returns<{ quality_check_id: string }[]>()
  );
  return new Set((data ?? []).map((r) => r.quality_check_id));
}

async function fetchBatchOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subject: Subject
): Promise<BatchOption[]> {
  const current = await fetchCurrentApprovalIds(supabase, subject);
  if (subject === "raw_material") {
    // ACC-08 (29 Sept 2026): paged past the 1,000-row cap, newest first.
    // Ordering by ar_number sorted as text ("AR-1000…" before "AR-101…"), so
    // once there were more than 1,000 approvals the newest ones fell off.
    const { data } = await fetchAllRows((from, to) =>
      supabase
        .from("quality_checks")
        .select("id, ar_number, purchase_lines(batch_number, items(item_code, name))")
        .eq("status", "approved")
        .not("purchase_line_id", "is", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<
          {
            id: string;
            ar_number: string;
            purchase_lines: { batch_number: string; items: { item_code: string; name: string } | null } | null;
          }[]
        >()
    );
    return (data ?? []).filter((qc) => current.has(qc.id)).map((qc) => ({
      qualityCheckId: qc.id,
      label: `${qc.ar_number} · ${qc.purchase_lines?.items?.item_code ?? "—"} ${qc.purchase_lines?.items?.name ?? ""} · Batch ${qc.purchase_lines?.batch_number ?? "—"}`,
      legacy: isLegacyCode(qc.purchase_lines?.items?.item_code) || isLegacyCode(qc.purchase_lines?.batch_number),
    }));
  }

  const { data } = await fetchAllRows((from, to) =>
    supabase
      .from("quality_checks")
      .select("id, ar_number, finished_product_batches(batch_number, short_batch_no, mfr_definitions(name))")
      .eq("status", "approved")
      .not("finished_product_batch_id", "is", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
      .returns<
        {
          id: string;
          ar_number: string;
          finished_product_batches: { batch_number: string; short_batch_no: string | null; mfr_definitions: { name: string } | null } | null;
        }[]
      >()
  );
  return (data ?? []).filter((qc) => current.has(qc.id)).map((qc) => ({
    qualityCheckId: qc.id,
    label: `${qc.ar_number} · ${qc.finished_product_batches?.mfr_definitions?.name ?? "—"} · Batch ${qc.finished_product_batches ? fpBatchBoth(qc.finished_product_batches.batch_number, qc.finished_product_batches.short_batch_no) : "—"}`,
    legacy: isLegacyCode(qc.finished_product_batches?.batch_number),
  }));
}

type Resolved =
  | { ok: true; itemTypeId: string; itemTypeDescription: string; headerFields: HeaderField[] }
  | { ok: false; reason: string };

async function resolveRawMaterial(supabase: Awaited<ReturnType<typeof createClient>>, qualityCheckId: string): Promise<Resolved> {
  const { data: qc, error: qcError } = await supabase
    .from("quality_checks")
    .select(
      "id, ar_number, created_at, reviewed_at, sample_qty, sample_unit, purchase_lines(batch_number, quantity, unit, qc_qty, items(item_code, name, item_type_id, item_types(description)), purchase_orders(invoice_number, vendors(name)))"
    )
    .eq("id", qualityCheckId)
    .maybeSingle<{
      id: string;
      ar_number: string;
      created_at: string;
      reviewed_at: string | null;
      sample_qty: number | string | null;
      sample_unit: string | null;
      purchase_lines: {
        batch_number: string;
        quantity: number | string;
        unit: string;
        qc_qty: number | string;
        items: { item_code: string; name: string; item_type_id: string | null; item_types: { description: string } | null } | null;
        purchase_orders: { invoice_number: string; vendors: { name: string } | null } | null;
      } | null;
    }>();
  if (qcError) return { ok: false, reason: `Could not load this batch's details: ${qcError.message}` };
  if (!qc) return { ok: false, reason: "Could not find this quality check — reload and try again." };

  const pl = qc.purchase_lines;
  if (!pl) return { ok: false, reason: "This quality check has no linked purchase line." };
  const plItems = pl.items;
  if (!plItems) return { ok: false, reason: "This purchase line has no linked item." };
  if (!plItems.item_type_id) {
    return {
      ok: false,
      reason: `"${plItems.name}" (${plItems.item_code}) has no Item Type set — set one on Item Master before a COA can be generated for it.`,
    };
  }

  // Order matches the sample certificate's own left-column-then-right-
  // column layout exactly (5 left / 5 right) — coa-pdf.ts splits this
  // array in half by position to reproduce that same two-column header.
  const headerFields: HeaderField[] = [
    { label: "Name of Raw Material", value: pl.items?.name ?? "" },
    { label: "RM Code", value: pl.items?.item_code ?? "" },
    { label: "Purchased From", value: pl.purchase_orders?.vendors?.name ?? "" },
    // ACC-15: this AR's own sample (a retest's sample differs from the
    // batch's first QC sample on the purchase line).
    {
      label: "Sampled Qty",
      value:
        qc.sample_qty !== null
          ? `${formatQty(qc.sample_qty)} ${qc.sample_unit ?? pl.unit}`
          : `${formatQty(pl.qc_qty)} ${pl.unit}`,
    },
    { label: "Analysis date", value: formatDate(qc.created_at) },
    { label: "AR No", value: qc.ar_number },
    { label: "Batch No", value: pl.batch_number },
    { label: "Qty Purchased", value: `${formatQty(pl.quantity)} ${pl.unit}` },
    { label: "Challan No", value: pl.purchase_orders?.invoice_number ?? "" },
    { label: "Reporting Date", value: formatDate(qc.reviewed_at) },
  ];

  return {
    ok: true,
    itemTypeId: plItems.item_type_id,
    itemTypeDescription: plItems.item_types?.description ?? "—",
    headerFields,
  };
}

async function resolveFinishedProduct(supabase: Awaited<ReturnType<typeof createClient>>, qualityCheckId: string): Promise<Resolved> {
  // Ravi: an MFR whose detail page clearly showed "Item type: Oil" still
  // got "no Item Type set" here. Root cause — mfr_definitions.item_type_id
  // is a deprecated column (0010_mfr_finished_product_link.sql: "left in
  // place, deprecated, simply unused by new code going forward... The
  // linked Finished Product item now carries its own item_type_id, reached
  // via finished_product_item_id"). This resolver was reading that
  // deprecated column directly instead of going through the item, the way
  // the MFR detail page itself does (app/(dashboard)/mfr/[id]/page.tsx) —
  // wrong for any MFR whose deprecated column was never (or no longer)
  // kept in sync with the real one on its Finished Product item. Now reads
  // item_type_id from the linked item, same as that page.
  const { data: qc, error: qcError } = await supabase
    .from("quality_checks")
    .select(
      "id, created_at, reviewed_at, sample_qty, sample_unit, finished_product_batches(batch_number, short_batch_no, target_qty, unit, batch_start_date, expiry_month, qc_sample_qty, mfr_definitions(name, finished_product_item_id, items(item_code, item_type_id, item_types(description))))"
    )
    .eq("id", qualityCheckId)
    .maybeSingle<{
      id: string;
      created_at: string;
      reviewed_at: string | null;
      sample_qty: number | string | null;
      sample_unit: string | null;
      finished_product_batches: {
        batch_number: string;
        short_batch_no: string | null;
        target_qty: number | string;
        unit: string;
        batch_start_date: string | null;
        expiry_month: string | null;
        qc_sample_qty: number | string | null;
        mfr_definitions: {
          name: string;
          finished_product_item_id: string | null;
          items: { item_code: string; item_type_id: string | null; item_types: { description: string } | null } | null;
        } | null;
      } | null;
    }>();
  if (qcError) return { ok: false, reason: `Could not load this batch's details: ${qcError.message}` };
  if (!qc) return { ok: false, reason: "Could not find this quality check — reload and try again." };

  const fp = qc.finished_product_batches;
  if (!fp) return { ok: false, reason: "This quality check has no linked Finished Product batch." };
  const mfr = fp.mfr_definitions;
  if (!mfr) return { ok: false, reason: "This batch's Finished Product recipe (MFR) could not be found." };
  const fpItem = mfr.items;
  if (!fpItem) return { ok: false, reason: `"${mfr.name}" has no linked Finished Product item.` };
  if (!fpItem.item_type_id) {
    return {
      ok: false,
      reason: `"${mfr.name}" has no Item Type set on its linked Finished Product item — set one on Item Master before a COA can be generated for it.`,
    };
  }

  // Order matches the sample certificate's own left-column-then-right-
  // column layout exactly (5 left / 4 right) — coa-pdf.ts splits this
  // array in half by position to reproduce that same two-column header,
  // so the order here IS the layout, not just a list.
  const headerFields: HeaderField[] = [
    { label: "Name of Product", value: mfr.name ?? "" },
    { label: "Batch no.", value: fpBatchShort(fp.batch_number, fp.short_batch_no) },
    { label: "Mfg. Date", value: formatDate(fp.batch_start_date) },
    {
      label: "Sampled Qty",
      value:
        qc.sample_qty !== null
          ? `${formatQty(qc.sample_qty)} ${qc.sample_unit ?? fp.unit}`
          : fp.qc_sample_qty !== null
            ? `${formatQty(fp.qc_sample_qty)} ${fp.unit}`
            : "",
    },
    { label: "Analysis date", value: formatDate(qc.created_at) },
    { label: "FP Code", value: fpItem.item_code ?? "" },
    { label: "Batch Quantity", value: `${formatQty(fp.target_qty)} ${fp.unit}` },
    { label: "Best before Dt", value: formatDate(fp.expiry_month) },
    { label: "Reporting date", value: formatDate(qc.reviewed_at) },
  ];

  return {
    ok: true,
    itemTypeId: fpItem.item_type_id,
    itemTypeDescription: fpItem.item_types?.description ?? "—",
    headerFields,
  };
}

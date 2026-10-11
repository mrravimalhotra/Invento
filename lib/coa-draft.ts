import { createClient } from "@/lib/supabase/server";
import { formatDate, formatQty, fpBatchShort } from "@/lib/utils";
import type { HeaderField } from "@/lib/actions/coa";

// SCAN-P4-08 (Ravi, 12 Oct 2026): the certificate header is worked out here, from the
// quality check and the batch, for BOTH the New Certificate page (to pre-fill the form)
// and the server action that saves the certificate (to refuse a header that does not
// match the record). Before, the action stored whatever the browser sent.

export type Resolved =
  | {
      ok: true;
      templateSubject: { kind: "item" | "mfr"; id: string };
      subjectLabel: string;
      headerFields: HeaderField[];
    }
  | { ok: false; reason: string };

export async function resolveRawMaterial(supabase: Awaited<ReturnType<typeof createClient>>, qualityCheckId: string): Promise<Resolved> {
  const { data: qc, error: qcError } = await supabase
    .from("quality_checks")
    .select(
      "id, ar_number, created_at, reviewed_at, sample_qty, sample_unit, purchase_lines(item_id, batch_number, quantity, unit, qc_qty, items(item_code, name), purchase_orders(invoice_number, vendors(name)))"
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
        item_id: string;
        batch_number: string;
        quantity: number | string;
        unit: string;
        qc_qty: number | string;
        items: { item_code: string; name: string } | null;
        purchase_orders: { invoice_number: string; vendors: { name: string } | null } | null;
      } | null;
    }>();
  if (qcError) return { ok: false, reason: `Could not load this batch's details: ${qcError.message}` };
  if (!qc) return { ok: false, reason: "Could not find this quality check — reload and try again." };

  const pl = qc.purchase_lines;
  if (!pl) return { ok: false, reason: "This quality check has no linked purchase line." };
  const plItems = pl.items;
  if (!plItems) return { ok: false, reason: "This purchase line has no linked item." };

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
    templateSubject: { kind: "item", id: pl.item_id },
    subjectLabel: `${plItems.item_code} · ${plItems.name}`,
    headerFields,
  };
}

export async function resolveFinishedProduct(supabase: Awaited<ReturnType<typeof createClient>>, qualityCheckId: string): Promise<Resolved> {
  // The COA template of a Finished Product belongs to its MFR (3 Oct 2026), so the
  // batch's mfr_definition_id is all that is needed to find it.
  const { data: qc, error: qcError } = await supabase
    .from("quality_checks")
    .select(
      "id, created_at, reviewed_at, sample_qty, sample_unit, finished_product_batches(mfr_definition_id, batch_number, short_batch_no, target_qty, unit, batch_start_date, expiry_month, qc_sample_qty, mfr_definitions(code, name, finished_product_item_id, items(item_code)))"
    )
    .eq("id", qualityCheckId)
    .maybeSingle<{
      id: string;
      created_at: string;
      reviewed_at: string | null;
      sample_qty: number | string | null;
      sample_unit: string | null;
      finished_product_batches: {
        mfr_definition_id: string;
        batch_number: string;
        short_batch_no: string | null;
        target_qty: number | string;
        unit: string;
        batch_start_date: string | null;
        expiry_month: string | null;
        qc_sample_qty: number | string | null;
        mfr_definitions: {
          code: string;
          name: string;
          finished_product_item_id: string | null;
          items: { item_code: string } | null;
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
    templateSubject: { kind: "mfr", id: fp.mfr_definition_id },
    subjectLabel: `${fpItem.item_code ?? mfr.code} · ${mfr.name}`,
    headerFields,
  };
}

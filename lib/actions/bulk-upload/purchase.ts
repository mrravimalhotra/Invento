"use server";

import { quantityLimitError, unitPriceLimitError } from "@/lib/limits";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { UNITS, convertUnit, type Unit } from "@/lib/constants/units";
import { revalidatePath } from "next/cache";
import { parseUploadDate, DATE_FORMAT_HINT } from "@/lib/bulk-upload/dates";
import { PURCHASE_COLUMNS } from "@/lib/bulk-upload/schemas";
import { friendlyDbError } from "@/lib/db-errors";
import { futureDateError } from "@/lib/date-rules";
import { cell, matchUnit, loadSheetOrError, type BulkUploadState } from "@/lib/bulk-upload/server";

// ------------------------------------------------------------------
// Purchase
// ------------------------------------------------------------------
type PurchaseLinePayload = {
  item_id: string;
  quantity: number;
  unit: Unit;
  qc_qty: number;
  stability_qty: number;
  rnd_qty: number;
  unit_price: number | null;
  gst_pct: number | null;
};
type PurchaseOrderPayload = {
  vendor_id: string;
  invoice_number: string;
  invoice_date: string;
  lines: PurchaseLinePayload[];
};

export async function bulkUploadPurchase(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "purchase")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, PURCHASE_COLUMNS, "purchase");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows, rowNumbers } = loaded.sheet;

  const supabase = await createClient();
  const [{ data: vendors }, { data: items }, { data: existingPoRows }] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("vendors").select("id, vendor_code, name").eq("active", true).order("id", { ascending: true }).range(from, to)),
    // Only Raw Material and Packaging items are purchasable — same rule
    // createPurchaseLine()'s own item picker enforces (purchase/[id]/page.tsx).
    fetchAllRows((from, to) => supabase.from("items").select("id, item_code, name, category").in("category", ["raw", "packaging"]).eq("active", true).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("purchase_orders").select("vendor_id, invoice_number").order("id", { ascending: true }).range(from, to)),
  ]);
  // Keyed by name (not code) — several active rows can share a name, so
  // each key maps to an array; a row is only usable once that array
  // resolves to exactly one match (see the per-row lookups below).
  const vendorByName = new Map<string, { id: string; vendor_code: string }[]>();
  (vendors ?? []).forEach((v) => {
    const key = v.name.trim().toLowerCase();
    const arr = vendorByName.get(key) ?? [];
    arr.push({ id: v.id, vendor_code: v.vendor_code });
    vendorByName.set(key, arr);
  });
  const itemByName = new Map<string, { id: string; item_code: string; category: string }[]>();
  (items ?? []).forEach((it) => {
    const key = it.name.trim().toLowerCase();
    const arr = itemByName.get(key) ?? [];
    arr.push({ id: it.id, item_code: it.item_code, category: it.category });
    itemByName.set(key, arr);
  });
  // purchase_orders has no DB-level unique constraint on (vendor_id,
  // invoice_number) — checked only when a NEW group is opened below (i.e.
  // against the DB, not within-file — repeating the same Vendor Name +
  // Invoice Number across rows in one file is how one purchase order's
  // multiple lines are expressed, and is already handled by the grouping
  // itself). Scoped per vendor, not globally — different vendors
  // legitimately reuse their own invoice numbering. Ravi (13 Sept 2026, via
  // AskUserQuestion): "add duplicate blocking on ... Purchase Invoice
  // Number (per vendor) ... for both bulk upload and the regular
  // one-at-a-time forms."
  const existingPoKeys = new Set(
    (existingPoRows ?? []).map((po) => `${po.vendor_id}||${po.invoice_number.trim().toLowerCase()}`)
  );

  const rowErrors: string[] = [];
  // Groups keyed by (Vendor Name, Invoice Number) — repeating both across
  // rows is how one purchase order's multiple lines are expressed in a
  // flat spreadsheet, the same flat-file grouping pattern MFR_COLUMNS
  // uses for recipe lines (see the template's Instructions sheet).
  const groups = new Map<string, { firstRow: number; def: PurchaseOrderPayload }>();

  rows.forEach((row, i) => {
    const r = rowNumbers[i];
    const vendorNameRaw = cell(row, headers, PURCHASE_COLUMNS[0]);
    const invoiceNumberRaw = cell(row, headers, PURCHASE_COLUMNS[1]);
    const invoiceDateRaw = cell(row, headers, PURCHASE_COLUMNS[2]);
    const purchaseTypeRaw = cell(row, headers, PURCHASE_COLUMNS[3]);
    const itemNameRaw = cell(row, headers, PURCHASE_COLUMNS[4]);
    const quantityRaw = cell(row, headers, PURCHASE_COLUMNS[5]);
    const unitRaw = cell(row, headers, PURCHASE_COLUMNS[6]);
    const qcQtyRaw = cell(row, headers, PURCHASE_COLUMNS[7]);
    const stabilityQtyRaw = cell(row, headers, PURCHASE_COLUMNS[8]);
    const rndQtyRaw = cell(row, headers, PURCHASE_COLUMNS[9]);
    const sampleUnitRaw = cell(row, headers, PURCHASE_COLUMNS[10]);
    const unitPriceRaw = cell(row, headers, PURCHASE_COLUMNS[11]);
    const gstPctRaw = cell(row, headers, PURCHASE_COLUMNS[12]);

    const vendorMatches = vendorByName.get(vendorNameRaw.trim().toLowerCase()) ?? [];
    if (!vendorNameRaw || vendorMatches.length === 0) {
      rowErrors.push(`Row ${r}: Vendor Name "${vendorNameRaw}" doesn't match an existing active vendor.`);
      return;
    }
    if (vendorMatches.length > 1) {
      rowErrors.push(
        `Row ${r}: Vendor Name "${vendorNameRaw}" matches ${vendorMatches.length} active vendors (${vendorMatches.map((v) => v.vendor_code).join(", ")}) — use a more specific/unique name, or fix the duplicate in Vendor Master first.`
      );
      return;
    }
    const vendorId = vendorMatches[0].id;
    if (!invoiceNumberRaw) {
      rowErrors.push(`Row ${r}: Invoice Number is required.`);
      return;
    }
    const invoiceDate = invoiceDateRaw ? parseUploadDate(invoiceDateRaw) : null;
    if (!invoiceDateRaw || !invoiceDate) {
      rowErrors.push(
        `Row ${r} (Invoice "${invoiceNumberRaw}"): Invoice Date "${invoiceDateRaw}" isn't a valid date — ${DATE_FORMAT_HINT}.`
      );
      return;
    }
    // Date rule (Ravi, 3 Oct 2026), same as New purchase order: not in the future.
    const invoiceFuture = futureDateError(invoiceDate, "Invoice Date");
    if (invoiceFuture) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): ${invoiceFuture}`);
      return;
    }

    const typeNorm = purchaseTypeRaw.trim().toLowerCase();
    let category: "raw" | "packaging" | null = null;
    if (typeNorm === "raw material" || typeNorm === "raw") category = "raw";
    else if (
      typeNorm === "packaging item" ||
      typeNorm === "packaging" ||
      typeNorm === "packing material" ||
      typeNorm === "packing"
    )
      category = "packaging";
    if (!category) {
      rowErrors.push(
        `Row ${r} (Invoice "${invoiceNumberRaw}"): Purchase Type must be "Raw Material" or "Packaging Item" — got "${purchaseTypeRaw}".`
      );
      return;
    }

    const itemMatchesAnyCategory = itemByName.get(itemNameRaw.trim().toLowerCase()) ?? [];
    if (!itemNameRaw || itemMatchesAnyCategory.length === 0) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): Item Name "${itemNameRaw}" doesn't match an existing active item.`);
      return;
    }
    const itemMatches = itemMatchesAnyCategory.filter((it) => it.category === category);
    if (itemMatches.length === 0) {
      // Real matches exist, just not in this row's own category — same
      // friendly message the old code-based check gave, still possible to
      // give here since we already have the (wrong-category) match(es).
      const otherCategory = itemMatchesAnyCategory[0].category === "raw" ? "Raw Material" : "Packaging";
      rowErrors.push(
        `Row ${r} (Invoice "${invoiceNumberRaw}"): Item Name "${itemNameRaw}" is a ${otherCategory} item, but Purchase Type says "${purchaseTypeRaw}".`
      );
      return;
    }
    if (itemMatches.length > 1) {
      rowErrors.push(
        `Row ${r} (Invoice "${invoiceNumberRaw}"): Item Name "${itemNameRaw}" matches ${itemMatches.length} active ${category === "raw" ? "Raw Material" : "Packaging"} items (${itemMatches.map((it) => it.item_code).join(", ")}) — use a more specific/unique name, or fix the duplicate in Item Master first.`
      );
      return;
    }
    const item = itemMatches[0];

    const quantity = Number(quantityRaw);
    if (!quantityRaw || Number.isNaN(quantity) || quantity <= 0) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): Quantity must be a number greater than 0.`);
      return;
    }
    const unit = matchUnit(unitRaw);
    if (!unit) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): Unit "${unitRaw}" isn't a valid unit (${UNITS.join(", ")}).`);
      return;
    }
    const quantityTooBig = quantityLimitError("Quantity", quantity, unit);
    if (quantityTooBig) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): ${quantityTooBig}`);
      return;
    }

    // QC/Stability/R&D sampling only applies to Raw Material lines — same
    // rule the Purchase line form itself enforces by hiding these fields
    // for a Packaging Item line.
    if (category === "packaging" && (qcQtyRaw || stabilityQtyRaw || rndQtyRaw || sampleUnitRaw)) {
      rowErrors.push(
        `Row ${r} (Invoice "${invoiceNumberRaw}"): QC Qty / Stability Qty / R&D Qty / Sample Unit only apply to Raw Material lines — leave them blank for a Packaging Item line.`
      );
      return;
    }

    // Ravi (20 Sept 2026): "at the time of purchase, sample quantities for
    // QC, R&D and Stability should be mandatory in both UI as well as bulk
    // upload and can not be NULL" — the UI side of this rule already
    // existed (createPurchaseLine()/updatePurchaseLine() in
    // lib/actions/purchase.ts, 15 Sept 2026 pass), but this bulk-upload
    // path was still silently treating a blank cell as "0"
    // (`Number(qcQtyRaw || "0")` below), which is exactly the "left blank,
    // never actually entered" gap the UI rule was built to close — a
    // Raw Material row could be imported with no QC/Stability/R&D sample
    // ever having been consciously specified. Same rule as the UI: 0 stays
    // a valid, explicitly-entered value (checked here BEFORE the `|| "0"`
    // fallback below runs, same reasoning as createPurchaseLine's own
    // comment) — only a genuinely blank cell is rejected. Packaging rows
    // are already required to leave these blank (the check just above),
    // so this only ever applies to Raw Material rows.
    if (category === "raw") {
      if (!qcQtyRaw) {
        rowErrors.push(
          `Row ${r} (Invoice "${invoiceNumberRaw}"): QC Qty is required for a Raw Material line — enter 0 if this line needs no QC sample.`
        );
        return;
      }
      if (!stabilityQtyRaw) {
        rowErrors.push(
          `Row ${r} (Invoice "${invoiceNumberRaw}"): Stability Qty is required for a Raw Material line — enter 0 if this line needs no stability sample.`
        );
        return;
      }
      if (!rndQtyRaw) {
        rowErrors.push(
          `Row ${r} (Invoice "${invoiceNumberRaw}"): R&D Qty is required for a Raw Material line — enter 0 if this line needs no R&D sample.`
        );
        return;
      }
    }

    const sampleUnit = sampleUnitRaw || unitRaw;
    const qcQtyEntered = Number(qcQtyRaw || "0");
    const stabilityQtyEntered = Number(stabilityQtyRaw || "0");
    const rndQtyEntered = Number(rndQtyRaw || "0");
    if ([qcQtyEntered, stabilityQtyEntered, rndQtyEntered].some((n) => Number.isNaN(n) || n < 0)) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): QC Qty / Stability Qty / R&D Qty must be numbers ≥ 0.`);
      return;
    }

    // Converted from Sample Unit to the line's own Unit before storing —
    // same conversion createPurchaseLine() does by hand (FB-0017).
    const qc_qty = convertUnit(qcQtyEntered, sampleUnit, unit);
    const stability_qty = convertUnit(stabilityQtyEntered, sampleUnit, unit);
    const rnd_qty = convertUnit(rndQtyEntered, sampleUnit, unit);
    if (qc_qty === null || stability_qty === null || rnd_qty === null) {
      rowErrors.push(
        `Row ${r} (Invoice "${invoiceNumberRaw}"): Sample Unit "${sampleUnit}" can't be converted to Unit "${unit}" — pick a compatible unit.`
      );
      return;
    }
    if (qc_qty + stability_qty + rnd_qty > quantity) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): QC + Stability + R&D quantity cannot exceed Quantity.`);
      return;
    }

    // B3: every purchase line needs a price and a GST % (0 is allowed) so the invoice value is never silently short.
    if (!unitPriceRaw) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): Unit Price is required (enter 0 if there is none).`);
      return;
    }
    if (!gstPctRaw) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): GST % is required (enter 0 if there is none).`);
      return;
    }
    let unit_price: number | null = null;
    if (unitPriceRaw) {
      const n = Number(unitPriceRaw);
      if (Number.isNaN(n) || n < 0) {
        rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): Unit Price must be a number ≥ 0.`);
        return;
      }
      const priceTooBig = unitPriceLimitError(n);
      if (priceTooBig) {
        rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): ${priceTooBig}`);
        return;
      }
      unit_price = n;
    }
    let gst_pct: number | null = null;
    if (gstPctRaw) {
      const n = Number(gstPctRaw);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): GST % must be a number from 0 to 100.`);
        return;
      }
      gst_pct = n;
    }

    const line: PurchaseLinePayload = { item_id: item.id, quantity, unit, qc_qty, stability_qty, rnd_qty, unit_price, gst_pct };
    // Keyed by the resolved vendor id (not the raw cell text) — vendorId is
    // already guaranteed unique for this row (the ambiguity check above
    // returned early otherwise), so this groups correctly even if the same
    // vendor's name was typed with different casing/whitespace on
    // different rows.
    const key = `${vendorId}||${invoiceNumberRaw.trim().toLowerCase()}`;
    const existing = groups.get(key);
    if (!existing) {
      if (existingPoKeys.has(key)) {
        rowErrors.push(`Row ${r}: Invoice "${invoiceNumberRaw}" already exists for vendor "${vendorNameRaw}".`);
        return;
      }
      groups.set(key, {
        firstRow: r,
        def: { vendor_id: vendorId, invoice_number: invoiceNumberRaw.trim(), invoice_date: invoiceDate, lines: [line] },
      });
      return;
    }
    // Every row for the same Vendor Name + Invoice Number must repeat the
    // same Invoice Date — catches a typo/copy-paste slip before it
    // silently changes the header, mirroring MFR's header-consistency
    // check above.
    if (existing.def.invoice_date !== invoiceDate) {
      rowErrors.push(
        `Row ${r} (Invoice "${invoiceNumberRaw}"): Invoice Date must match row ${existing.firstRow} — every line for the same Vendor Name + Invoice Number must repeat the same Invoice Date.`
      );
      return;
    }
    existing.def.lines.push(line);
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const payload = Array.from(groups.values()).map((g) => g.def);
  if (payload.length === 0) return { error: "No purchase rows found in that file." };

  const { data, error } = await supabase.rpc("bulk_create_purchase_orders", { p_payload: payload });
  if (error) {
    if (error.code === "23505") {
      return {
        error: "Two lines in this file needed the same auto-generated batch number at once — please try uploading again.",
      };
    }
    return { error: friendlyDbError(error, "Nothing was imported — the purchase order upload failed.") };
  }

  revalidatePath("/purchase");
  const poCount = data?.length ?? payload.length;
  const lineCount = payload.reduce((sum, p) => sum + p.lines.length, 0);
  return {
    success: `Imported ${poCount} purchase order${poCount === 1 ? "" : "s"} (${lineCount} line${lineCount === 1 ? "" : "s"}), landed as Draft.`,
  };
}

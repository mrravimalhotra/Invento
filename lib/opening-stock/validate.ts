import { findColumnIndex, type ParsedSheet } from "@/lib/bulk-upload/parse";
import { parseUploadDate, DATE_FORMAT_HINT } from "@/lib/bulk-upload/dates";
import type { ColumnDef } from "@/lib/bulk-upload/schemas";
import { OPENING_COLUMNS, QC_STATUS_WORDS, type OpeningKind } from "./columns";
import { MAX_RM_RETESTS } from "@/lib/constants/qc-rules";

// Checks every row of an opening stock sheet and builds the rows the database
// function load_opening_stock() takes. The database repeats the important
// checks; these ones exist to list every problem at once, with Excel row numbers.

export type OpeningItem = { id: string; item_code: string; category: string; unit: string; packaged_item_id?: string | null };

export type OpeningContext = {
  today: string; // yyyy-mm-dd, India
  itemsByCode: Map<string, OpeningItem>; // key: lower-case item code
  vendorIdByCode: Map<string, string>; // key: lower-case vendor code
  existingBatches: Set<string>; // `${itemId}|${batch}`
  existingArs: Set<string>;
  // finished product only: items that are the finished product of an MFR, and every batch number in use
  fpItemIds?: Set<string>;
  existingFpBatches?: Set<string>;
};

export type OpeningRowPayload = Record<string, string | number | null>;

export type OpeningCheck = {
  errors: string[];
  rows: OpeningRowPayload[];
  counts: { approved: number; pending: number; rejected: number };
};

const APP_AR = /^AR(RM|FP)-\d+\/\d{2}$/i;

export function validateOpeningSheet(kind: OpeningKind, sheet: ParsedSheet, ctx: OpeningContext): OpeningCheck {
  if (kind === "finished") return validateFinishedSheet(sheet, ctx);
  const columns = OPENING_COLUMNS[kind];
  const idx = new Map<string, number>(columns.map((c: ColumnDef) => [c.header, findColumnIndex(sheet.headers, c)]));
  const errors: string[] = [];
  const rows: OpeningRowPayload[] = [];
  const counts = { approved: 0, pending: 0, rejected: 0 };
  const seenBatches = new Set<string>();
  const seenArs = new Set<string>();

  sheet.rows.forEach((raw, n) => {
    const xr = sheet.rowNumbers[n];
    const get = (h: string) => {
      const i = idx.get(h) ?? -1;
      return i === -1 ? "" : (raw[i] ?? "").trim();
    };
    const bad = (msg: string) => errors.push(`Row ${xr}: ${msg}`);
    const startErrors = errors.length;

    const date = (h: string, required: boolean, noFuture = true): string | null => {
      const t = get(h);
      if (!t) {
        if (required) bad(`${h} is required.`);
        return null;
      }
      const d = parseUploadDate(t);
      if (!d) {
        bad(`${h} "${t}" is not a date — ${DATE_FORMAT_HINT}.`);
        return null;
      }
      if (noFuture && d > ctx.today) {
        bad(`${h} cannot be in the future.`);
        return null;
      }
      return d;
    };
    const num = (h: string, required: boolean): number | null => {
      const t = get(h);
      if (!t) {
        if (required) bad(`${h} is required.`);
        return null;
      }
      const v = Number(t.replace(/,/g, "").replace(/\s*%$/, ""));
      if (!Number.isFinite(v)) {
        bad(`${h} "${t}" is not a number.`);
        return null;
      }
      return v;
    };

    // item
    const code = get("Item Code");
    const item = code ? ctx.itemsByCode.get(code.toLowerCase()) : undefined;
    if (!code) bad("Item Code is required.");
    else if (!item) bad(`Item Code "${code}" is not an active item in Item Master.`);
    else if (item.category !== (kind === "raw" ? "raw" : "packaging")) {
      bad(`${item.item_code} is not a ${kind === "raw" ? "raw material" : "packaging"} item.`);
    }

    const qty = num(kind === "raw" ? "Quantity in stock" : "Quantity", true);
    if (qty !== null && qty <= 0) bad("Quantity must be above 0.");
    const receipt = date("Receipt date", true);

    const price = num("Unit price", false);
    if (price !== null && price < 0) bad("Unit price cannot be negative.");
    const gst = num("GST %", false);
    if (gst !== null && (gst < 0 || gst > 100)) bad("GST % must be between 0 and 100.");
    const vcode = get("Vendor Code");
    let vendorId: string | null = null;
    if (vcode) {
      vendorId = ctx.vendorIdByCode.get(vcode.toLowerCase()) ?? null;
      if (!vendorId) bad(`Vendor Code "${vcode}" is not an active vendor in Vendor Master.`);
    }

    let batch = "";
    if (kind === "raw") {
      batch = get("Batch No");
      if (!batch) bad("Batch No is required.");
    } else {
      batch = get("Lot No");
    }
    if (item && batch) {
      if (batch.toLowerCase().startsWith(item.item_code.toLowerCase() + "-") && /\/\d{2}$/.test(batch)) {
        bad(`Batch No "${batch}" looks like a number made by this app. Use the number on the container.`);
      } else {
        const key = `${item.id}|${batch}`;
        if (ctx.existingBatches.has(key)) bad(`Batch No "${batch}" already exists for ${item.item_code}.`);
        else if (seenBatches.has(key)) bad(`Batch No "${batch}" appears twice for ${item.item_code} in this file.`);
        seenBatches.add(key);
      }
    }

    const payload: OpeningRowPayload = {
      item_id: item?.id ?? null,
      batch_number: batch || null,
      quantity: qty,
      receipt_date: receipt,
      vendor_id: vendorId,
      unit_price: price,
      gst_pct: gst,
    };

    if (kind === "raw") {
      const statusText = get("QC status");
      const status = statusText ? QC_STATUS_WORDS[statusText.toLowerCase()] : undefined;
      if (!statusText) bad("QC status is required (Approved, Pending QC or Rejected).");
      else if (!status) bad(`QC status "${statusText}" must be Approved, Pending QC or Rejected.`);

      const expiry = date("Manufacturer expiry date", status === "approved" || status === "pending", false);
      if (expiry && receipt && expiry < receipt) bad("Manufacturer expiry date cannot be before the receipt date.");
      payload.expiry_date = expiry;
      payload.qc_status = status ?? null;

      if (status) counts[status] += 1;
      if (status === "approved" || status === "rejected") {
        const ar = get("Old AR No");
        if (!ar) bad(`Old AR No is required for a${status === "approved" ? "n Approved" : " Rejected"} batch.`);
        else if (APP_AR.test(ar)) bad(`Old AR No "${ar}" looks like a number made by this app. Use the number from the old records.`);
        else if (ctx.existingArs.has(ar)) bad(`Old AR No "${ar}" is already used.`);
        else if (seenArs.has(ar)) bad(`Old AR No "${ar}" appears twice in this file.`);
        if (ar) seenArs.add(ar);
        payload.old_ar = ar || null;

        const appr = date("QC approval date", true);
        if (appr && receipt && appr < receipt) bad("QC approval date cannot be before the receipt date.");
        payload.approval_date = appr;

        if (status === "approved") {
          const retest = date("Retest date", true, false);
          if (retest && appr && retest <= appr) bad("Retest date must be after the QC approval date.");
          payload.retest_date = retest;
          const done = num("Retests already done", false);
          if (done !== null && (!Number.isInteger(done) || done < 0 || done > MAX_RM_RETESTS)) {
            bad(`Retests already done must be a whole number from 0 to ${MAX_RM_RETESTS}.`);
          }
          payload.retests_done = done ?? 0;
        }
      } else if (status === "pending") {
        for (const h of ["Old AR No", "QC approval date", "Retest date"]) {
          if (get(h)) bad(`${h} must be blank for a Pending QC batch.`);
        }
      }
    }

    if (errors.length === startErrors) rows.push(payload);
  });

  return { errors, rows, counts };
}

// ---- finished product ------------------------------------------------------

const UNIT_ALIASES: Record<string, string> = {
  kg: "kg", kgs: "kg", g: "g", gm: "g", gms: "g", gram: "g", grams: "g", mg: "mg",
  ml: "ml", l: "ltr", lt: "ltr", ltr: "ltr", litre: "ltr", liter: "ltr", litres: "ltr", liters: "ltr", nos: "nos",
};
const FAMILY: Record<string, string> = { mg: "w", g: "w", kg: "w", ml: "v", ltr: "v" };

/** "100 ml" -> { qty: 100, unit: "ml" }; a bare number uses the product's unit. */
export function parsePackSize(text: string, itemUnit: string): { qty: number; unit: string } | null {
  const m = /^(\d+(?:\.\d+)?)\s*([A-Za-z]+)?$/.exec(text.trim());
  if (!m) return null;
  const qty = Number(m[1]);
  const unit = m[2] ? UNIT_ALIASES[m[2].toLowerCase()] : itemUnit;
  if (!unit || !(qty > 0)) return null;
  if (unit !== itemUnit && (FAMILY[unit] === undefined || FAMILY[unit] !== FAMILY[itemUnit])) return null;
  return { qty, unit };
}

function validateFinishedSheet(sheet: ParsedSheet, ctx: OpeningContext): OpeningCheck {
  const columns = OPENING_COLUMNS.finished;
  const idx = new Map<string, number>(columns.map((c: ColumnDef) => [c.header, findColumnIndex(sheet.headers, c)]));
  const errors: string[] = [];
  const rows: OpeningRowPayload[] = [];
  const seenBatches = new Set<string>();
  const seenArs = new Set<string>();

  sheet.rows.forEach((raw, n) => {
    const xr = sheet.rowNumbers[n];
    const get = (h: string) => {
      const i = idx.get(h) ?? -1;
      return i === -1 ? "" : (raw[i] ?? "").trim();
    };
    const bad = (msg: string) => errors.push(`Row ${xr}: ${msg}`);
    const start = errors.length;

    const date = (h: string): string | null => {
      const t = get(h);
      if (!t) {
        bad(`${h} is required.`);
        return null;
      }
      const d = parseUploadDate(t);
      if (!d) {
        bad(`${h} "${t}" is not a date — ${DATE_FORMAT_HINT}.`);
        return null;
      }
      return d;
    };
    const num = (h: string): number => {
      const t = get(h);
      if (!t) return 0;
      const v = Number(t.replace(/,/g, ""));
      if (!Number.isFinite(v)) {
        bad(`${h} "${t}" is not a number.`);
        return 0;
      }
      return v;
    };

    const code = get("Product Code");
    const item = code ? ctx.itemsByCode.get(code.toLowerCase()) : undefined;
    if (!code) bad("Product Code is required.");
    else if (!item || !ctx.fpItemIds?.has(item.id)) bad(`Product Code "${code}" is not a finished product with an MFR.`);

    const batch = get("Batch No");
    if (!batch) bad("Batch No is required.");
    else if (
      (item && batch.toLowerCase().startsWith(item.item_code.toLowerCase() + "-") && /\/\d{2}$/.test(batch)) ||
      /^(PR|OR)-\d+\/\d{2}$/i.test(batch)
    ) {
      bad(`Batch No "${batch}" looks like a number made by this app. Use the number from the old records.`);
    } else if (ctx.existingFpBatches?.has(batch)) bad(`Batch No "${batch}" is already used.`);
    else if (seenBatches.has(batch)) bad(`Batch No "${batch}" appears twice in this file.`);
    if (batch) seenBatches.add(batch);

    const mfg = date("Manufacture date");
    if (mfg && mfg > ctx.today) bad("Manufacture date cannot be in the future.");
    const exp = date("Expiry date");
    if (mfg && exp && exp <= mfg) bad("Expiry date must be after the manufacture date.");
    const appr = date("QC approval date");
    if (appr && appr > ctx.today) bad("QC approval date cannot be in the future.");
    if (appr && mfg && appr < mfg) bad("QC approval date cannot be before the manufacture date.");

    const ar = get("Old AR No");
    if (!ar) bad("Old AR No is required.");
    else if (APP_AR.test(ar)) bad(`Old AR No "${ar}" looks like a number made by this app. Use the number from the old records.`);
    else if (ctx.existingArs.has(ar)) bad(`Old AR No "${ar}" is already used.`);
    else if (seenArs.has(ar)) bad(`Old AR No "${ar}" appears twice in this file.`);
    if (ar) seenArs.add(ar);

    const bulk = num("Bulk quantity unpacked");
    const packs = num("Packs in stock");
    if (bulk < 0) bad("Bulk quantity unpacked cannot be negative.");
    if (packs < 0 || !Number.isInteger(packs)) bad("Packs in stock must be a whole number, 0 or more.");
    if (bulk === 0 && packs === 0 && errors.length === start) bad("Enter Bulk quantity unpacked, Packs in stock, or both.");

    let size: { qty: number; unit: string } | null = null;
    if (packs > 0) {
      const t = get("Pack size");
      if (!t) bad("Pack size is required when packs are in stock.");
      else if (!item) size = null;
      else {
        size = parsePackSize(t, item.unit);
        if (!size) bad(`Pack size "${t}" is not valid for a product kept in ${item.unit}. Use a number with a unit of the same kind, e.g. 100 ml.`);
      }
      if (item && !item.packaged_item_id) bad(`${item.item_code} has no packaged item yet, so packs cannot be recorded for it.`);
    }

    if (errors.length === start && item) {
      rows.push({
        item_id: item.id,
        batch_number: batch,
        manufacture_date: mfg,
        expiry_date: exp,
        bulk_qty: bulk,
        packs,
        pack_size_qty: size?.qty ?? null,
        pack_size_unit: size?.unit ?? null,
        old_ar: ar,
        approval_date: appr,
      });
    }
  });

  return { errors, rows, counts: { approved: rows.length, pending: 0, rejected: 0 } };
}

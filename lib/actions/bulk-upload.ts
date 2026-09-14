"use server";

// Bulk data upload — Server Actions.
//
// Ravi (13 Sept 2026): "create a link in admin panel to upload data...
// as bulk upload" for Item Master, Vendor, Item Type, MFR (Purchase
// deliberately out of scope this pass — see lib/bulk-upload/schemas.ts).
// Scoped via AskUserQuestion: codes are ALWAYS server-generated (never
// read from the file), validation is all-or-nothing per file (any row
// error means nothing is imported), and each module's upload is gated by
// that same module's existing canWrite() role set — not admin-only —
// matching who can already create one record at a time by hand.
//
// Item Master / Vendor Master / Item Type Master need no new RPC: once
// every row is validated (and, for Item/Vendor, every code generated) a
// single multi-row supabase.from(table).insert([...]) is already one
// atomic Postgres statement — "all rows or none" for free. MFR is
// different (a multi-table, multi-step, multi-group operation) and goes
// through the new bulk_create_mfr_definitions() RPC (0037_bulk_upload_
// mfr.sql) for true all-or-nothing atomicity across the whole file — see
// that migration's header comment for the full reasoning.
//
// Purchase, Instrument/Equipment Master, and Dead Stock Register added
// 13 Sept 2026 (Ravi: "can we have purchase, instrument and dead stock
// entries done as excel as part of bulk upload utility we created").
// Equipment and Dead Stock are flat, single-table master data — same
// "validate every row, generate every code, one multi-row insert" shape
// as Vendor Master, no new RPC needed. Purchase again needs its own RPC
// (bulk_create_purchase_orders(), 0038_bulk_upload_purchase.sql) for the
// same reason MFR does: one row = one purchase line, grouped into a
// purchase order by repeating Vendor Code + Invoice Number (+ Invoice
// Date), and every bulk-uploaded purchase order lands as a Draft — see
// that migration's header comment for the "why Draft needs no special
// code" reasoning.

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { UNITS, convertUnit, type Unit } from "@/lib/constants/units";
import { revalidatePath } from "next/cache";
import { readFirstSheet, findColumnIndex } from "@/lib/bulk-upload/parse";
import {
  ITEM_COLUMNS,
  VENDOR_COLUMNS,
  ITEM_TYPE_COLUMNS,
  MFR_COLUMNS,
  PURCHASE_COLUMNS,
  EQUIPMENT_COLUMNS,
  DEAD_STOCK_COLUMNS,
  MAX_UPLOAD_ROWS,
  BULK_UPLOAD_MODULE_META,
  type BulkUploadModuleKey,
  type ColumnDef,
} from "@/lib/bulk-upload/schemas";

export type BulkUploadState =
  | { error?: string; rowErrors?: string[]; success?: string }
  | undefined;

function cell(row: string[], headers: string[], col: ColumnDef): string {
  const idx = findColumnIndex(headers, col);
  if (idx === -1) return "";
  return (row[idx] ?? "").trim();
}

function matchUnit(raw: string): Unit | null {
  const target = raw.trim().toLowerCase();
  return UNITS.find((u) => u === target) ?? null;
}

async function loadSheetOrError(formData: FormData, columns: ColumnDef[], module: BulkUploadModuleKey) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an Excel file (.xlsx) to upload." } as const;
  }

  let sheet;
  try {
    sheet = await readFirstSheet(file, BULK_UPLOAD_MODULE_META[module].sheetName);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that file." } as const;
  }

  const missing = columns.filter((c) => c.required && findColumnIndex(sheet.headers, c) === -1);
  if (missing.length > 0) {
    return {
      error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing
        .map((c) => `"${c.header}"`)
        .join(", ")} — did you use the downloaded template?`,
    } as const;
  }

  if (sheet.rows.length === 0) {
    return { error: "That file has no data rows — nothing to import." } as const;
  }
  if (sheet.rows.length > MAX_UPLOAD_ROWS) {
    return {
      error: `That file has ${sheet.rows.length} data rows — the limit per upload is ${MAX_UPLOAD_ROWS}. Split it into smaller files and upload separately.`,
    } as const;
  }

  return { sheet } as const;
}

// Excel row number for a data row at zero-based index i (row 1 is the
// header, row 2 is the first data row) — used only in error messages so
// they point at the same row number the uploader sees in Excel.
const excelRow = (i: number) => i + 2;

// ------------------------------------------------------------------
// Item Master
// ------------------------------------------------------------------
export async function bulkUploadItems(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "items")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, ITEM_COLUMNS, "items");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows } = loaded.sheet;

  const supabase = await createClient();
  const [{ data: itemTypes }, { data: existingBarcodeRows }, { data: existingItemRows }] = await Promise.all([
    supabase.from("item_types").select("id, description").eq("active", true),
    supabase.from("items").select("barcode, item_code").not("barcode", "is", null),
    supabase.from("items").select("name"),
  ]);
  const itemTypeByName = new Map((itemTypes ?? []).map((t) => [t.description.trim().toLowerCase(), t.id]));
  // Barcode is DB-unique (items.barcode unique) — checked here against
  // every existing item (not just this file's own rows) so a collision
  // surfaces as a specific row error before any insert is attempted,
  // instead of the whole batch failing on a generic Postgres 23505 after
  // the fact with no row number to point at.
  const existingBarcodeToCode = new Map(
    (existingBarcodeRows ?? [])
      .filter((it): it is { barcode: string; item_code: string } => !!it.barcode)
      .map((it) => [it.barcode.trim().toLowerCase(), it.item_code])
  );
  // items.name has no DB-level unique constraint — same reasoning and
  // pattern as Vendor Master's name dedup below. Ravi (13 Sept 2026, via
  // AskUserQuestion): "add duplicate blocking on Item Name ... for both
  // bulk upload and the regular one-at-a-time forms."
  const existingItemNames = new Set((existingItemRows ?? []).map((it) => it.name.trim().toLowerCase()));

  type Parsed = {
    name: string;
    category: "raw" | "packaging";
    item_type_id: string | null;
    unit: Unit | null;
    botanical_alias: string | null;
    barcode: string | null;
    low_stock_threshold: number | null;
  };

  const rowErrors: string[] = [];
  const parsed: Parsed[] = [];
  const seenBarcodes = new Map<string, number>();
  const seenItemNames = new Map<string, number>();

  rows.forEach((row, i) => {
    const r = excelRow(i);
    const name = cell(row, headers, ITEM_COLUMNS[0]);
    const categoryRaw = cell(row, headers, ITEM_COLUMNS[1]);
    const itemTypeRaw = cell(row, headers, ITEM_COLUMNS[2]);
    const unitRaw = cell(row, headers, ITEM_COLUMNS[3]);
    const botanicalAlias = cell(row, headers, ITEM_COLUMNS[4]) || null;
    const barcode = cell(row, headers, ITEM_COLUMNS[5]) || null;
    const thresholdRaw = cell(row, headers, ITEM_COLUMNS[6]);

    if (!name) {
      rowErrors.push(`Row ${r}: Name is required.`);
      return;
    }
    const nameKey = name.toLowerCase();
    if (seenItemNames.has(nameKey)) {
      rowErrors.push(`Row ${r}: "${name}" is repeated on row ${seenItemNames.get(nameKey)} of this file.`);
      return;
    }
    if (existingItemNames.has(nameKey)) {
      rowErrors.push(`Row ${r}: "${name}" already exists as an item.`);
      return;
    }
    seenItemNames.set(nameKey, r);

    const categoryNorm = categoryRaw.trim().toLowerCase();
    let category: "raw" | "packaging" | null = null;
    if (categoryNorm === "raw material" || categoryNorm === "raw") category = "raw";
    // "Packing material" is real vocabulary Ravi himself has used for this
    // same category elsewhere (FB-0035's ticket text) — accepted alongside
    // the template's own "Packaging" so a legitimately-intended value isn't
    // wrongly rejected, while anything else still fails.
    else if (categoryNorm === "packaging" || categoryNorm === "packing material" || categoryNorm === "packing")
      category = "packaging";
    if (!category) {
      rowErrors.push(`Row ${r} ("${name}"): Category must be "Raw Material" or "Packaging" — got "${categoryRaw}".`);
      return;
    }

    let item_type_id: string | null = null;
    if (itemTypeRaw) {
      const match = itemTypeByName.get(itemTypeRaw.trim().toLowerCase());
      if (!match) {
        rowErrors.push(`Row ${r} ("${name}"): Item Type "${itemTypeRaw}" doesn't match an existing active Item Type Master description.`);
        return;
      }
      item_type_id = match;
    }

    let unit: Unit | null = null;
    if (unitRaw) {
      unit = matchUnit(unitRaw);
      if (!unit) {
        rowErrors.push(`Row ${r} ("${name}"): Unit "${unitRaw}" isn't a valid unit (${UNITS.join(", ")}).`);
        return;
      }
    }

    let low_stock_threshold: number | null = null;
    if (thresholdRaw) {
      const n = Number(thresholdRaw);
      if (Number.isNaN(n) || n < 0) {
        rowErrors.push(`Row ${r} ("${name}"): Low Stock Threshold must be a number ≥ 0.`);
        return;
      }
      low_stock_threshold = n;
    }

    if (barcode) {
      const key = barcode.toLowerCase();
      if (seenBarcodes.has(key)) {
        rowErrors.push(`Row ${r} ("${name}"): Barcode "${barcode}" is repeated on row ${seenBarcodes.get(key)} of this file.`);
        return;
      }
      const existingCode = existingBarcodeToCode.get(key);
      if (existingCode) {
        rowErrors.push(`Row ${r} ("${name}"): Barcode "${barcode}" is already used by existing item ${existingCode}.`);
        return;
      }
      seenBarcodes.set(key, r);
    }

    parsed.push({ name, category, item_type_id, unit, botanical_alias: botanicalAlias, barcode, low_stock_threshold });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  // Codes are always server-generated, one nextval() round trip per row,
  // done sequentially before the one bulk insert below (see 0037's header
  // comment on why a failed later insert only leaves a harmless code-
  // number gap, never a partial import).
  const insertRows: Record<string, unknown>[] = [];
  for (const p of parsed) {
    const { data: itemCode, error: codeError } = await supabase.rpc("get_next_item_code", { p_category: p.category });
    if (codeError || !itemCode) {
      return { error: `Could not generate an item code (stopped after ${insertRows.length} of ${parsed.length}): ${codeError?.message ?? "unknown error"}` };
    }
    insertRows.push({
      item_code: itemCode,
      name: p.name,
      botanical_alias: p.botanical_alias,
      category: p.category,
      item_type_id: p.item_type_id,
      unit: p.unit,
      barcode: p.barcode,
      low_stock_threshold: p.low_stock_threshold,
    });
  }

  const { error } = await supabase.from("items").insert(insertRows);
  if (error) {
    const msg =
      error.code === "23505"
        ? error.message.includes("barcode")
          ? "One of the barcodes in this file is already used by an existing item — nothing was imported."
          : "One of the item codes generated for this file already exists — nothing was imported. Please try again."
        : error.message;
    return { error: msg };
  }

  revalidatePath("/items");
  return { success: `Imported ${insertRows.length} item${insertRows.length === 1 ? "" : "s"}.` };
}

// ------------------------------------------------------------------
// Vendor Master
// ------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function bulkUploadVendors(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "vendors")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, VENDOR_COLUMNS, "vendors");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows } = loaded.sheet;

  const supabase = await createClient();
  // vendors.name has no DB-level unique constraint at all (vendor_code is
  // the only unique identifier, and it's always server-generated) — so
  // without an app-level check here, two rows with the same name (or a
  // name matching an existing vendor) would both insert cleanly as
  // separate vendors. Checked case-insensitively, same convention as
  // Item Type Master's Description dedup below: "Ambadas" and "ambadas"
  // should collide too. Ravi (13 Sept 2026): "make sure there is
  // validation so it is not allowed to add duplicate Vendors."
  const { data: existingVendors } = await supabase.from("vendors").select("name");
  const existingNames = new Set((existingVendors ?? []).map((v) => v.name.trim().toLowerCase()));

  type Parsed = { name: string; address: string | null; mobile: string | null; phone: string | null; email: string | null };
  const rowErrors: string[] = [];
  const parsed: Parsed[] = [];
  const seenNames = new Map<string, number>();

  rows.forEach((row, i) => {
    const r = excelRow(i);
    const name = cell(row, headers, VENDOR_COLUMNS[0]);
    const address = cell(row, headers, VENDOR_COLUMNS[1]) || null;
    const mobile = cell(row, headers, VENDOR_COLUMNS[2]) || null;
    const phone = cell(row, headers, VENDOR_COLUMNS[3]) || null;
    const emailRaw = cell(row, headers, VENDOR_COLUMNS[4]);

    if (!name) {
      rowErrors.push(`Row ${r}: Name is required.`);
      return;
    }
    if (emailRaw && !EMAIL_RE.test(emailRaw)) {
      rowErrors.push(`Row ${r} ("${name}"): "${emailRaw}" isn't a valid email address.`);
      return;
    }
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) {
      rowErrors.push(`Row ${r}: "${name}" is repeated on row ${seenNames.get(nameKey)} of this file.`);
      return;
    }
    if (existingNames.has(nameKey)) {
      rowErrors.push(`Row ${r}: "${name}" already exists as a vendor.`);
      return;
    }
    seenNames.set(nameKey, r);

    parsed.push({ name, address, mobile, phone, email: emailRaw || null });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const insertRows: Record<string, unknown>[] = [];
  for (const p of parsed) {
    const { data: vendorCode, error: codeError } = await supabase.rpc("get_next_vendor_code");
    if (codeError || !vendorCode) {
      return { error: `Could not generate a vendor code (stopped after ${insertRows.length} of ${parsed.length}): ${codeError?.message ?? "unknown error"}` };
    }
    insertRows.push({ vendor_code: vendorCode, name: p.name, address: p.address, mobile: p.mobile, phone: p.phone, email: p.email });
  }

  const { error } = await supabase.from("vendors").insert(insertRows);
  if (error) return { error: error.message };

  revalidatePath("/vendors");
  return { success: `Imported ${insertRows.length} vendor${insertRows.length === 1 ? "" : "s"}.` };
}

// ------------------------------------------------------------------
// Item Type Master
// ------------------------------------------------------------------
export async function bulkUploadItemTypes(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "item_types")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, ITEM_TYPE_COLUMNS, "item-types");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows } = loaded.sheet;

  const supabase = await createClient();
  // item_types.description is DB-unique but Postgres text comparison is
  // case-sensitive — "Powder" and "powder" wouldn't collide at the
  // constraint level and would otherwise create a near-duplicate that's
  // confusing everywhere it's picked from (Item Master, MFR). Checked
  // case-insensitively against every existing item type, active or not,
  // since the constraint itself doesn't care about active status either.
  const { data: existingTypes } = await supabase.from("item_types").select("description");
  const existingDescriptions = new Set((existingTypes ?? []).map((t) => t.description.trim().toLowerCase()));

  const rowErrors: string[] = [];
  const descriptions: string[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, i) => {
    const r = excelRow(i);
    const description = cell(row, headers, ITEM_TYPE_COLUMNS[0]);
    if (!description) {
      rowErrors.push(`Row ${r}: Description is required.`);
      return;
    }
    const key = description.toLowerCase();
    if (seen.has(key)) {
      rowErrors.push(`Row ${r}: "${description}" is repeated on row ${seen.get(key)} of this file.`);
      return;
    }
    if (existingDescriptions.has(key)) {
      rowErrors.push(`Row ${r}: "${description}" already exists as an item type.`);
      return;
    }
    seen.set(key, r);
    descriptions.push(description);
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const { error } = await supabase.from("item_types").insert(descriptions.map((description) => ({ description })));
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "One of these descriptions already exists as an item type — nothing was imported."
          : error.message,
    };
  }

  revalidatePath("/item-types");
  return { success: `Imported ${descriptions.length} item type${descriptions.length === 1 ? "" : "s"}.` };
}

// ------------------------------------------------------------------
// MFR
// ------------------------------------------------------------------
type MfrLinePayload = { item_id: string; quantity: number; unit: Unit };
type MfrDefPayload = {
  name: string;
  batch_size_qty: number;
  batch_size_unit: Unit;
  item_type_id: string | null;
  lines: MfrLinePayload[];
};

export async function bulkUploadMfr(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "mfr")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, MFR_COLUMNS, "mfr");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows } = loaded.sheet;

  const supabase = await createClient();
  const [{ data: itemTypes }, { data: rawItems }, { data: existingMfrRows }] = await Promise.all([
    supabase.from("item_types").select("id, description").eq("active", true),
    supabase.from("items").select("id, item_code").eq("category", "raw").eq("active", true),
    supabase.from("mfr_definitions").select("name"),
  ]);
  const itemTypeByName = new Map((itemTypes ?? []).map((t) => [t.description.trim().toLowerCase(), t.id]));
  const rawItemByCode = new Map((rawItems ?? []).map((it) => [it.item_code.trim().toLowerCase(), it.id]));
  // mfr_definitions.name has no DB-level unique constraint — same reasoning
  // as Item/Vendor's name dedup. Checked only when a NEW group is opened
  // below (i.e. against the DB, not within-file — repeating the same MFR
  // Name across rows in one file is how its multiple recipe lines are
  // expressed, and is already handled by the grouping itself). Ravi (13
  // Sept 2026, via AskUserQuestion): "add duplicate blocking on ... MFR
  // Name ... for both bulk upload and the regular one-at-a-time forms."
  const existingMfrNames = new Set((existingMfrRows ?? []).map((m) => m.name.trim().toLowerCase()));

  const rowErrors: string[] = [];
  // Groups keyed by exact (trimmed) MFR Name text — repeating the same
  // name across rows is how one MFR's multiple recipe lines are
  // expressed in a flat spreadsheet (see the template's Instructions
  // sheet).
  const groups = new Map<string, { firstRow: number; def: MfrDefPayload }>();

  rows.forEach((row, i) => {
    const r = excelRow(i);
    const name = cell(row, headers, MFR_COLUMNS[0]);
    const batchQtyRaw = cell(row, headers, MFR_COLUMNS[1]);
    const batchUnitRaw = cell(row, headers, MFR_COLUMNS[2]);
    const itemTypeRaw = cell(row, headers, MFR_COLUMNS[3]);
    const lineCodeRaw = cell(row, headers, MFR_COLUMNS[4]);
    const lineQtyRaw = cell(row, headers, MFR_COLUMNS[5]);
    const lineUnitRaw = cell(row, headers, MFR_COLUMNS[6]);

    if (!name) {
      rowErrors.push(`Row ${r}: MFR Name is required.`);
      return;
    }

    const batchQty = Number(batchQtyRaw);
    if (!batchQtyRaw || Number.isNaN(batchQty) || batchQty <= 0) {
      rowErrors.push(`Row ${r} ("${name}"): Batch Size Qty must be a number greater than 0.`);
      return;
    }
    const batchUnit = matchUnit(batchUnitRaw);
    if (!batchUnit) {
      rowErrors.push(`Row ${r} ("${name}"): Batch Size Unit "${batchUnitRaw}" isn't a valid unit (${UNITS.join(", ")}).`);
      return;
    }

    let item_type_id: string | null = null;
    if (itemTypeRaw) {
      const match = itemTypeByName.get(itemTypeRaw.trim().toLowerCase());
      if (!match) {
        rowErrors.push(`Row ${r} ("${name}"): Item Type "${itemTypeRaw}" doesn't match an existing active Item Type Master description.`);
        return;
      }
      item_type_id = match;
    }

    const rawItemId = rawItemByCode.get(lineCodeRaw.trim().toLowerCase());
    if (!lineCodeRaw || !rawItemId) {
      rowErrors.push(`Row ${r} ("${name}"): Line Item Code "${lineCodeRaw}" doesn't match an existing active Raw Material item code.`);
      return;
    }
    const lineQty = Number(lineQtyRaw);
    if (!lineQtyRaw || Number.isNaN(lineQty) || lineQty <= 0) {
      rowErrors.push(`Row ${r} ("${name}"): Line Quantity must be a number greater than 0.`);
      return;
    }
    const lineUnit = matchUnit(lineUnitRaw);
    if (!lineUnit) {
      rowErrors.push(`Row ${r} ("${name}"): Line Unit "${lineUnitRaw}" isn't a valid unit (${UNITS.join(", ")}).`);
      return;
    }

    const key = name.trim();
    const existing = groups.get(key);
    if (!existing) {
      if (existingMfrNames.has(key.toLowerCase())) {
        rowErrors.push(`Row ${r}: "${name}" already exists as an MFR.`);
        return;
      }
      groups.set(key, {
        firstRow: r,
        def: { name: key, batch_size_qty: batchQty, batch_size_unit: batchUnit, item_type_id, lines: [{ item_id: rawItemId, quantity: lineQty, unit: lineUnit }] },
      });
      return;
    }

    // Every row for the same MFR Name must repeat the same header fields
    // (batch size, unit, item type) — catches a typo/copy-paste slip
    // before it silently changes the header based on whichever row
    // happened to be inserted, since only the first row's values are
    // actually used.
    if (existing.def.batch_size_qty !== batchQty || existing.def.batch_size_unit !== batchUnit || existing.def.item_type_id !== item_type_id) {
      rowErrors.push(
        `Row ${r} ("${name}"): Batch Size Qty / Batch Size Unit / Item Type must match row ${existing.firstRow} — every line for the same MFR Name must repeat the same header values.`
      );
      return;
    }
    // Same Raw Material item added twice as two separate lines under one
    // MFR is almost always a copy-paste slip, not an intentional recipe —
    // rejected so a duplicated ingredient doesn't silently double-count
    // when the batch is actually produced. Combine into one line instead.
    if (existing.def.lines.some((l) => l.item_id === rawItemId)) {
      rowErrors.push(
        `Row ${r} ("${name}"): Line Item Code "${lineCodeRaw}" is already a recipe line for this MFR (see an earlier row) — combine into one line instead of repeating it.`
      );
      return;
    }
    existing.def.lines.push({ item_id: rawItemId, quantity: lineQty, unit: lineUnit });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const payload = Array.from(groups.values()).map((g) => g.def);
  if (payload.length === 0) return { error: "No MFR rows found in that file." };

  const { data, error } = await supabase.rpc("bulk_create_mfr_definitions", { p_payload: payload });
  if (error) return { error: error.message };

  // As of 0041_mfr_deferred_approval.sql, bulk-uploaded MFRs land the same
  // way a manually-created one now does: unapproved, with no Finished
  // Product / Packaged FP item pair yet — bulk upload never auto-approves,
  // so each one needs a manual Approve click (on its own /mfr/[id] page)
  // before it can be used for production. See that migration's header
  // comment (Ravi, 14 Sept 2026) for the full reasoning.
  revalidatePath("/mfr");
  const count = data?.length ?? payload.length;
  return {
    success: `Imported ${count} MFR definition${count === 1 ? "" : "s"} — each needs to be approved (on its own MFR page) before it can be used for production.`,
  };
}

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
  const { headers, rows } = loaded.sheet;

  const supabase = await createClient();
  const [{ data: vendors }, { data: items }, { data: existingPoRows }] = await Promise.all([
    supabase.from("vendors").select("id, vendor_code").eq("active", true),
    // Only Raw Material and Packaging items are purchasable — same rule
    // createPurchaseLine()'s own item picker enforces (purchase/[id]/page.tsx).
    supabase.from("items").select("id, item_code, category").in("category", ["raw", "packaging"]).eq("active", true),
    supabase.from("purchase_orders").select("vendor_id, invoice_number"),
  ]);
  const vendorByCode = new Map((vendors ?? []).map((v) => [v.vendor_code.trim().toLowerCase(), v.id]));
  const itemByCode = new Map(
    (items ?? []).map((it) => [it.item_code.trim().toLowerCase(), it as { id: string; item_code: string; category: string }])
  );
  // purchase_orders has no DB-level unique constraint on (vendor_id,
  // invoice_number) — checked only when a NEW group is opened below (i.e.
  // against the DB, not within-file — repeating the same Vendor Code +
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
  // Groups keyed by (Vendor Code, Invoice Number) — repeating both across
  // rows is how one purchase order's multiple lines are expressed in a
  // flat spreadsheet, the same flat-file grouping pattern MFR_COLUMNS
  // uses for recipe lines (see the template's Instructions sheet).
  const groups = new Map<string, { firstRow: number; def: PurchaseOrderPayload }>();

  rows.forEach((row, i) => {
    const r = excelRow(i);
    const vendorCodeRaw = cell(row, headers, PURCHASE_COLUMNS[0]);
    const invoiceNumberRaw = cell(row, headers, PURCHASE_COLUMNS[1]);
    const invoiceDateRaw = cell(row, headers, PURCHASE_COLUMNS[2]);
    const purchaseTypeRaw = cell(row, headers, PURCHASE_COLUMNS[3]);
    const itemCodeRaw = cell(row, headers, PURCHASE_COLUMNS[4]);
    const quantityRaw = cell(row, headers, PURCHASE_COLUMNS[5]);
    const unitRaw = cell(row, headers, PURCHASE_COLUMNS[6]);
    const qcQtyRaw = cell(row, headers, PURCHASE_COLUMNS[7]);
    const stabilityQtyRaw = cell(row, headers, PURCHASE_COLUMNS[8]);
    const rndQtyRaw = cell(row, headers, PURCHASE_COLUMNS[9]);
    const sampleUnitRaw = cell(row, headers, PURCHASE_COLUMNS[10]);
    const unitPriceRaw = cell(row, headers, PURCHASE_COLUMNS[11]);
    const gstPctRaw = cell(row, headers, PURCHASE_COLUMNS[12]);

    const vendorId = vendorByCode.get(vendorCodeRaw.trim().toLowerCase());
    if (!vendorCodeRaw || !vendorId) {
      rowErrors.push(`Row ${r}: Vendor Code "${vendorCodeRaw}" doesn't match an existing active vendor.`);
      return;
    }
    if (!invoiceNumberRaw) {
      rowErrors.push(`Row ${r}: Invoice Number is required.`);
      return;
    }
    const invoiceDateParsed = invoiceDateRaw ? new Date(invoiceDateRaw) : null;
    if (!invoiceDateRaw || !invoiceDateParsed || Number.isNaN(invoiceDateParsed.getTime())) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): Invoice Date "${invoiceDateRaw}" isn't a valid date.`);
      return;
    }
    const invoiceDate = invoiceDateParsed.toISOString().slice(0, 10);

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

    const item = itemByCode.get(itemCodeRaw.trim().toLowerCase());
    if (!itemCodeRaw || !item) {
      rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): Item Code "${itemCodeRaw}" doesn't match an existing active item.`);
      return;
    }
    if (item.category !== category) {
      rowErrors.push(
        `Row ${r} (Invoice "${invoiceNumberRaw}"): Item Code "${itemCodeRaw}" is a ${item.category === "raw" ? "Raw Material" : "Packaging"} item, but Purchase Type says "${purchaseTypeRaw}".`
      );
      return;
    }

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

    // QC/Stability/R&D sampling only applies to Raw Material lines — same
    // rule the Purchase line form itself enforces by hiding these fields
    // for a Packaging Item line.
    if (category === "packaging" && (qcQtyRaw || stabilityQtyRaw || rndQtyRaw || sampleUnitRaw)) {
      rowErrors.push(
        `Row ${r} (Invoice "${invoiceNumberRaw}"): QC Qty / Stability Qty / R&D Qty / Sample Unit only apply to Raw Material lines — leave them blank for a Packaging Item line.`
      );
      return;
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

    let unit_price: number | null = null;
    if (unitPriceRaw) {
      const n = Number(unitPriceRaw);
      if (Number.isNaN(n) || n < 0) {
        rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): Unit Price must be a number ≥ 0.`);
        return;
      }
      unit_price = n;
    }
    let gst_pct: number | null = null;
    if (gstPctRaw) {
      const n = Number(gstPctRaw);
      if (Number.isNaN(n) || n < 0) {
        rowErrors.push(`Row ${r} (Invoice "${invoiceNumberRaw}"): GST % must be a number ≥ 0.`);
        return;
      }
      gst_pct = n;
    }

    const line: PurchaseLinePayload = { item_id: item.id, quantity, unit, qc_qty, stability_qty, rnd_qty, unit_price, gst_pct };
    const key = `${vendorCodeRaw.trim().toLowerCase()}||${invoiceNumberRaw.trim().toLowerCase()}`;
    const existing = groups.get(key);
    if (!existing) {
      const dbKey = `${vendorId}||${invoiceNumberRaw.trim().toLowerCase()}`;
      if (existingPoKeys.has(dbKey)) {
        rowErrors.push(`Row ${r}: Invoice "${invoiceNumberRaw}" already exists for vendor "${vendorCodeRaw}".`);
        return;
      }
      groups.set(key, {
        firstRow: r,
        def: { vendor_id: vendorId, invoice_number: invoiceNumberRaw.trim(), invoice_date: invoiceDate, lines: [line] },
      });
      return;
    }
    // Every row for the same Vendor Code + Invoice Number must repeat the
    // same Invoice Date — catches a typo/copy-paste slip before it
    // silently changes the header, mirroring MFR's header-consistency
    // check above.
    if (existing.def.invoice_date !== invoiceDate) {
      rowErrors.push(
        `Row ${r} (Invoice "${invoiceNumberRaw}"): Invoice Date must match row ${existing.firstRow} — every line for the same Vendor Code + Invoice Number must repeat the same Invoice Date.`
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
    return { error: error.message };
  }

  revalidatePath("/purchase");
  const poCount = data?.length ?? payload.length;
  const lineCount = payload.reduce((sum, p) => sum + p.lines.length, 0);
  return {
    success: `Imported ${poCount} purchase order${poCount === 1 ? "" : "s"} (${lineCount} line${lineCount === 1 ? "" : "s"}), landed as Draft.`,
  };
}

// ------------------------------------------------------------------
// Instrument / Equipment Master
// ------------------------------------------------------------------
const CALIBRATION_STATUS_MAP: Record<string, string> = {
  calibrated: "calibrated",
  due: "due",
  "not applicable": "not_applicable",
  na: "not_applicable",
  "n/a": "not_applicable",
};

// Shared by Equipment and Dead Stock below — returns the parsed date (as
// YYYY-MM-DD) for a non-empty cell, null for a blank one, or undefined as
// a sentinel meaning "already pushed a row error, stop parsing this row."
function parseOptionalDate(raw: string, label: string, r: number, rowErrors: string[]): string | null | undefined {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    rowErrors.push(`Row ${r}: ${label} "${raw}" isn't a valid date.`);
    return undefined;
  }
  return d.toISOString().slice(0, 10);
}

export async function bulkUploadEquipment(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "equipment")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, EQUIPMENT_COLUMNS, "equipment");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows } = loaded.sheet;

  const supabase = await createClient();
  // Asset ID is the unique key for equipment, not Name — Ravi (14 Sept
  // 2026): "make 'Asset ID' as unique key across application including
  // bulk data upload template and remove unique constraint from Name."
  // Supersedes the Name-based dedup this pass replaces (added 13 Sept
  // 2026) — Equipment Name is now deliberately allowed to repeat within a
  // file (several identical "Wooden Barrels" rows, each with its own
  // distinct Asset ID, is the normal shape for this module's real data).
  // App-level only, no DB constraint — same as every other duplicate
  // check in this app (Ravi's explicit choice, via AskUserQuestion).
  const { data: existingEquipmentRows } = await supabase.from("equipment").select("asset_id");
  const existingAssetIds = new Set(
    (existingEquipmentRows ?? []).flatMap((e) => (e.asset_id ? [e.asset_id.trim().toLowerCase()] : []))
  );

  type Parsed = {
    name: string;
    room_no: string | null;
    section: string | null;
    asset_id: string | null;
    quantity: number;
    calibration_status: string | null;
    last_calibration_date: string | null;
    next_calibration_due: string | null;
  };

  const rowErrors: string[] = [];
  const parsed: Parsed[] = [];
  const seenAssetIds = new Map<string, number>();

  rows.forEach((row, i) => {
    const r = excelRow(i);
    const name = cell(row, headers, EQUIPMENT_COLUMNS[0]);
    const room_no = cell(row, headers, EQUIPMENT_COLUMNS[1]) || null;
    const section = cell(row, headers, EQUIPMENT_COLUMNS[2]) || null;
    const asset_id = cell(row, headers, EQUIPMENT_COLUMNS[3]) || null;
    const quantityRaw = cell(row, headers, EQUIPMENT_COLUMNS[4]);
    const calibRaw = cell(row, headers, EQUIPMENT_COLUMNS[5]);
    const lastCalibRaw = cell(row, headers, EQUIPMENT_COLUMNS[6]);
    const nextCalibRaw = cell(row, headers, EQUIPMENT_COLUMNS[7]);

    if (!name) {
      rowErrors.push(`Row ${r}: Name is required.`);
      return;
    }

    // Asset ID is optional (many equipment rows legitimately have none) —
    // only checked for duplicates when a row actually supplies one.
    if (asset_id) {
      const assetKey = asset_id.toLowerCase();
      if (seenAssetIds.has(assetKey)) {
        rowErrors.push(`Row ${r}: Asset ID "${asset_id}" is repeated on row ${seenAssetIds.get(assetKey)} of this file.`);
        return;
      }
      if (existingAssetIds.has(assetKey)) {
        rowErrors.push(`Row ${r}: Asset ID "${asset_id}" already exists on another equipment record.`);
        return;
      }
      seenAssetIds.set(assetKey, r);
    }

    let quantity = 1;
    if (quantityRaw) {
      const n = Number(quantityRaw);
      if (Number.isNaN(n) || n <= 0) {
        rowErrors.push(`Row ${r} ("${name}"): Quantity must be a number greater than 0.`);
        return;
      }
      quantity = n;
    }

    let calibration_status: string | null = null;
    if (calibRaw) {
      const match = CALIBRATION_STATUS_MAP[calibRaw.trim().toLowerCase()];
      if (!match) {
        rowErrors.push(
          `Row ${r} ("${name}"): Calibration Status must be "Calibrated", "Due", or "Not Applicable" — got "${calibRaw}".`
        );
        return;
      }
      calibration_status = match;
    }

    const last_calibration_date = parseOptionalDate(lastCalibRaw, "Last Calibration Date", r, rowErrors);
    if (last_calibration_date === undefined) return;
    const next_calibration_due = parseOptionalDate(nextCalibRaw, "Next Calibration Due", r, rowErrors);
    if (next_calibration_due === undefined) return;

    parsed.push({ name, room_no, section, asset_id, quantity, calibration_status, last_calibration_date, next_calibration_due });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const insertRows: Record<string, unknown>[] = [];
  for (const p of parsed) {
    const { data: equipmentCode, error: codeError } = await supabase.rpc("get_next_equipment_code");
    if (codeError || !equipmentCode) {
      return {
        error: `Could not generate an equipment code (stopped after ${insertRows.length} of ${parsed.length}): ${codeError?.message ?? "unknown error"}`,
      };
    }
    insertRows.push({
      equipment_code: equipmentCode,
      name: p.name,
      room_no: p.room_no,
      section: p.section,
      asset_id: p.asset_id,
      quantity: p.quantity,
      calibration_status: p.calibration_status,
      last_calibration_date: p.last_calibration_date,
      next_calibration_due: p.next_calibration_due,
    });
  }

  const { error } = await supabase.from("equipment").insert(insertRows);
  if (error) return { error: error.message };

  revalidatePath("/equipment");
  return { success: `Imported ${insertRows.length} equipment record${insertRows.length === 1 ? "" : "s"}.` };
}

// ------------------------------------------------------------------
// Dead Stock Register
// ------------------------------------------------------------------
export async function bulkUploadDeadStock(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "dead_stock")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, DEAD_STOCK_COLUMNS, "dead-stock");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows } = loaded.sheet;

  const supabase = await createClient();
  // dead_stock_items.article_name has no DB-level unique constraint — same
  // reasoning and pattern as Item/Vendor's name dedup. Ravi (13 Sept 2026,
  // via AskUserQuestion): "add duplicate blocking on ... Dead Stock Article
  // Name ... for both bulk upload and the regular one-at-a-time forms."
  const { data: existingDeadStockRows } = await supabase.from("dead_stock_items").select("article_name");
  const existingArticleNames = new Set((existingDeadStockRows ?? []).map((d) => d.article_name.trim().toLowerCase()));

  type Parsed = {
    article_name: string;
    date_of_purchase: string | null;
    quantity: number;
    purchase_price: number | null;
    depreciation_pct: number;
    resolution_date: string | null;
    rejected_qty: number;
    rejected_value: number;
    balance_qty: number | null;
    balance_value: number | null;
    remark: string | null;
  };

  const rowErrors: string[] = [];
  const parsed: Parsed[] = [];
  const seenArticleNames = new Map<string, number>();

  rows.forEach((row, i) => {
    const r = excelRow(i);
    const article_name = cell(row, headers, DEAD_STOCK_COLUMNS[0]);
    const dateOfPurchaseRaw = cell(row, headers, DEAD_STOCK_COLUMNS[1]);
    const quantityRaw = cell(row, headers, DEAD_STOCK_COLUMNS[2]);
    const purchasePriceRaw = cell(row, headers, DEAD_STOCK_COLUMNS[3]);
    const depreciationRaw = cell(row, headers, DEAD_STOCK_COLUMNS[4]);
    const resolutionDateRaw = cell(row, headers, DEAD_STOCK_COLUMNS[5]);
    const rejectedQtyRaw = cell(row, headers, DEAD_STOCK_COLUMNS[6]);
    const rejectedValueRaw = cell(row, headers, DEAD_STOCK_COLUMNS[7]);
    const balanceQtyRaw = cell(row, headers, DEAD_STOCK_COLUMNS[8]);
    const balanceValueRaw = cell(row, headers, DEAD_STOCK_COLUMNS[9]);
    const remark = cell(row, headers, DEAD_STOCK_COLUMNS[10]) || null;

    if (!article_name) {
      rowErrors.push(`Row ${r}: Name of Article is required.`);
      return;
    }
    const articleKey = article_name.toLowerCase();
    if (seenArticleNames.has(articleKey)) {
      rowErrors.push(`Row ${r}: "${article_name}" is repeated on row ${seenArticleNames.get(articleKey)} of this file.`);
      return;
    }
    if (existingArticleNames.has(articleKey)) {
      rowErrors.push(`Row ${r}: "${article_name}" already exists as a dead stock record.`);
      return;
    }
    seenArticleNames.set(articleKey, r);

    const date_of_purchase = parseOptionalDate(dateOfPurchaseRaw, "Date of Purchase", r, rowErrors);
    if (date_of_purchase === undefined) return;
    const resolution_date = parseOptionalDate(resolutionDateRaw, "Resolution Date", r, rowErrors);
    if (resolution_date === undefined) return;

    let quantity = 1;
    if (quantityRaw) {
      const n = Number(quantityRaw);
      if (Number.isNaN(n) || n <= 0) {
        rowErrors.push(`Row ${r} ("${article_name}"): Quantity must be a number greater than 0.`);
        return;
      }
      quantity = n;
    }

    const parseNonNegative = (raw: string, label: string, fallback: number | null): number | null | undefined => {
      if (!raw) return fallback;
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0) {
        rowErrors.push(`Row ${r} ("${article_name}"): ${label} must be a number ≥ 0.`);
        return undefined;
      }
      return n;
    };

    const purchase_price = parseNonNegative(purchasePriceRaw, "Purchase Price", null);
    if (purchase_price === undefined) return;

    let depreciation_pct = 25;
    if (depreciationRaw) {
      const n = Number(depreciationRaw);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        rowErrors.push(`Row ${r} ("${article_name}"): Depreciation % must be a number from 0 to 100.`);
        return;
      }
      depreciation_pct = n;
    }

    const rejected_qty = parseNonNegative(rejectedQtyRaw, "Rejected Qty", 0);
    if (rejected_qty === undefined) return;
    const rejected_value = parseNonNegative(rejectedValueRaw, "Rejected Value", 0);
    if (rejected_value === undefined) return;
    const balance_qty = parseNonNegative(balanceQtyRaw, "Balance Qty", null);
    if (balance_qty === undefined) return;
    const balance_value = parseNonNegative(balanceValueRaw, "Balance Value", null);
    if (balance_value === undefined) return;

    parsed.push({
      article_name,
      date_of_purchase,
      quantity,
      purchase_price,
      depreciation_pct,
      resolution_date,
      rejected_qty: rejected_qty ?? 0,
      rejected_value: rejected_value ?? 0,
      balance_qty,
      balance_value,
      remark,
    });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const insertRows: Record<string, unknown>[] = [];
  for (const p of parsed) {
    const { data: assetCode, error: codeError } = await supabase.rpc("get_next_dead_stock_code");
    if (codeError || !assetCode) {
      return {
        error: `Could not generate an asset code (stopped after ${insertRows.length} of ${parsed.length}): ${codeError?.message ?? "unknown error"}`,
      };
    }
    insertRows.push({
      asset_code: assetCode,
      article_name: p.article_name,
      date_of_purchase: p.date_of_purchase,
      quantity: p.quantity,
      purchase_price: p.purchase_price,
      depreciation_pct: p.depreciation_pct,
      resolution_date: p.resolution_date,
      rejected_qty: p.rejected_qty,
      rejected_value: p.rejected_value,
      balance_qty: p.balance_qty,
      balance_value: p.balance_value,
      remark: p.remark,
    });
  }

  const { error } = await supabase.from("dead_stock_items").insert(insertRows);
  if (error) return { error: error.message };

  revalidatePath("/dead-stock");
  return { success: `Imported ${insertRows.length} dead stock record${insertRows.length === 1 ? "" : "s"}.` };
}

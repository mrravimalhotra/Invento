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

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { UNITS, type Unit } from "@/lib/constants/units";
import { revalidatePath } from "next/cache";
import { readFirstSheet, findColumnIndex } from "@/lib/bulk-upload/parse";
import {
  ITEM_COLUMNS,
  VENDOR_COLUMNS,
  ITEM_TYPE_COLUMNS,
  MFR_COLUMNS,
  MAX_UPLOAD_ROWS,
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

async function loadSheetOrError(formData: FormData, columns: ColumnDef[]) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an Excel file (.xlsx) to upload." } as const;
  }

  let sheet;
  try {
    sheet = await readFirstSheet(file);
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

  const loaded = await loadSheetOrError(formData, ITEM_COLUMNS);
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows } = loaded.sheet;

  const supabase = await createClient();
  const [{ data: itemTypes }, { data: existingBarcodeRows }] = await Promise.all([
    supabase.from("item_types").select("id, description").eq("active", true),
    supabase.from("items").select("barcode, item_code").not("barcode", "is", null),
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

  const loaded = await loadSheetOrError(formData, VENDOR_COLUMNS);
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows } = loaded.sheet;

  type Parsed = { name: string; address: string | null; mobile: string | null; phone: string | null; email: string | null };
  const rowErrors: string[] = [];
  const parsed: Parsed[] = [];

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

    parsed.push({ name, address, mobile, phone, email: emailRaw || null });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const supabase = await createClient();
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

  const loaded = await loadSheetOrError(formData, ITEM_TYPE_COLUMNS);
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

  const loaded = await loadSheetOrError(formData, MFR_COLUMNS);
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows } = loaded.sheet;

  const supabase = await createClient();
  const [{ data: itemTypes }, { data: rawItems }] = await Promise.all([
    supabase.from("item_types").select("id, description").eq("active", true),
    supabase.from("items").select("id, item_code").eq("category", "raw").eq("active", true),
  ]);
  const itemTypeByName = new Map((itemTypes ?? []).map((t) => [t.description.trim().toLowerCase(), t.id]));
  const rawItemByCode = new Map((rawItems ?? []).map((it) => [it.item_code.trim().toLowerCase(), it.id]));

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

  revalidatePath("/mfr");
  revalidatePath("/items");
  return { success: `Imported ${data?.length ?? payload.length} MFR definition${(data?.length ?? payload.length) === 1 ? "" : "s"}.` };
}

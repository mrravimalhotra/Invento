"use server";

import { normName } from "@/lib/name-rules";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { UNITS, type Unit } from "@/lib/constants/units";
import { revalidatePath } from "next/cache";
import { ITEM_COLUMNS } from "@/lib/bulk-upload/schemas";
import { friendlyDbError } from "@/lib/db-errors";
import { nextCodes, cell, matchUnit, loadSheetOrError, type BulkUploadState } from "@/lib/bulk-upload/server";

// ------------------------------------------------------------------
// Item Master
// ------------------------------------------------------------------
export async function bulkUploadItems(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "items")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, ITEM_COLUMNS, "items");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows, rowNumbers } = loaded.sheet;

  const supabase = await createClient();
  const [{ data: itemTypes }, { data: existingBarcodeRows }, { data: existingItemRows }] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("item_types").select("id, description").eq("active", true).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("items").select("barcode, item_code").not("barcode", "is", null).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("items").select("name").order("id", { ascending: true }).range(from, to)),
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
  const existingItemNames = new Set((existingItemRows ?? []).map((it) => normName(it.name)));

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
    const r = rowNumbers[i];
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
    const nameKey = normName(name);
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
    } else if (category === "raw") {
      // 30 Sept 2026 (Ravi): Item Type is mandatory for a Raw Material.
      rowErrors.push(`Row ${r} ("${name}"): Item Type is required for a Raw Material — pick one from the Reference sheet.`);
      return;
    }

    let unit: Unit | null = null;
    if (unitRaw) {
      unit = matchUnit(unitRaw);
      if (!unit) {
        rowErrors.push(`Row ${r} ("${name}"): Unit "${unitRaw}" isn't a valid unit (${UNITS.join(", ")}).`);
        return;
      }
    } else {
      // 30 Sept 2026 (Ravi): Unit is mandatory for every item.
      rowErrors.push(`Row ${r} ("${name}"): Unit is required (${UNITS.join(", ")}).`);
      return;
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

  // Codes are always server-generated, fetched in one call per category
  // before the one bulk insert below (see 0037's header comment on why a
  // failed later insert only leaves a harmless code-number gap, never a
  // partial import).
  const itemCodesByCategory = new Map<string, string[]>();
  for (const category of new Set(parsed.map((p) => p.category))) {
    const result = await nextCodes(supabase, "get_next_item_codes", { p_category: category }, parsed.filter((p) => p.category === category).length, "item");
    if ("error" in result) return { error: result.error };
    itemCodesByCategory.set(category, result.codes);
  }
  const insertRows: Record<string, unknown>[] = [];
  for (const p of parsed) {
    const itemCode = itemCodesByCategory.get(p.category)!.shift()!;
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
        : friendlyDbError(error);
    return { error: msg };
  }

  revalidatePath("/items");
  return { success: `Imported ${insertRows.length} item${insertRows.length === 1 ? "" : "s"}.` };
}

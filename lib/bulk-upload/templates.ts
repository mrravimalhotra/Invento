import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UNITS } from "@/lib/constants/units";
import {
  BULK_UPLOAD_MODULE_META,
  MAX_UPLOAD_ROWS,
  MODULE_COLUMNS,
  type BulkUploadModuleKey,
  type ColumnDef,
} from "./schemas";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8F0EA" }, // light brand-green tint, no dependency on the app's CSS variables
};

function addHeaderRow(sheet: ExcelJS.Worksheet, columns: ColumnDef[]) {
  const row = sheet.addRow(columns.map((c) => c.header + (c.required ? " *" : "")));
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });
  sheet.columns = columns.map((c) => ({ width: Math.max(18, c.header.length + 6) }));
}

// Converts an example row's cell values against each column's `numeric`
// flag before it's written — a column marked numeric (Quantity, Unit
// Price, Mobile, ...) gets a real Excel number in that cell instead of
// text, so Excel doesn't flag it with its own "Number Stored as Text"
// warning (Ravi, 13 Sept 2026, with a screenshot of exactly that warning
// on the Vendor Master template's Mobile example cell). A blank example
// value is left as an empty string either way — Number("") is 0, which
// would wrongly turn "leave blank" into a real zero in the template.
function exampleRowValues(columns: ColumnDef[], values: string[]): (string | number)[] {
  return values.map((v, i) => (columns[i]?.numeric && v !== "" ? Number(v) : v));
}

function addInstructionsSheet(
  workbook: ExcelJS.Workbook,
  title: string,
  columns: ColumnDef[],
  extraNotes: string[]
) {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.columns = [{ width: 100 }];
  const lines = [
    `${title} — bulk upload template`,
    "",
    "Fill in the sheet with this template's name (not this Instructions sheet), one row per record. Columns marked with * are required.",
    "Do not rename, reorder, or delete the header row — the upload reads columns by their header text.",
    "A code (item code / vendor code / MFR code) is always generated automatically when the file is imported — do not add or fill in a code column.",
    ...extraNotes,
    "",
    "Column notes:",
    ...columns.map((c) => `• ${c.header}${c.required ? " (required)" : ""}${c.hint ? " — " + c.hint : ""}`),
  ];
  lines.forEach((line) => {
    const row = sheet.addRow([line]);
    if (line.endsWith("template") || line === "Column notes:") row.font = { bold: true };
  });
}

function addReferenceSheet(sheet: ExcelJS.Worksheet, title: string, rows: string[]) {
  sheet.addRow([title]).font = { bold: true };
  rows.forEach((r) => sheet.addRow([r]));
  sheet.columns = [{ width: Math.max(30, title.length + 4) }];
}

// Writes one titled list into its own column (rather than stacking blocks
// vertically down column A, the way addReferenceSheet above does) — used
// where a dropdown's list formula needs a clean, addressable
// `Reference!$<col>$2:$<col>$<n>` range of its own, not mixed in with
// other sections. Returns the 1-indexed last row written (>= 2 always,
// even for zero rows, so a caller's range formula is never empty/invalid).
function addReferenceColumn(sheet: ExcelJS.Worksheet, colNumber: number, title: string, rows: string[]): number {
  const headerCell = sheet.getCell(1, colNumber);
  headerCell.value = title;
  headerCell.font = { bold: true };
  rows.forEach((r, i) => {
    sheet.getCell(2 + i, colNumber).value = r;
  });
  sheet.getColumn(colNumber).width = Math.max(28, title.length + 4);
  return Math.max(2, 1 + rows.length);
}

// A-Z only — every column this feature applies a dropdown to is well
// within that range (the widest module template has 13 columns), so no
// need to reach into exceljs's own internal col-letter helper for it.
function colLetter(n: number): string {
  return String.fromCharCode(64 + n);
}

// Applies an Excel "list" dropdown to a whole column range at once
// (rows startRow..endRow), sourced from `formulae` — either a literal
// quoted comma-list ('"A,B,C"') for a small fixed set, or a
// `Reference!$X$2:$X$<n>` range for one backed by live DB data.
// `showErrorMessage: false` is the whole point here (Ravi, 20 Sept 2026:
// "facility to type freely" alongside the dropdown) — Excel still offers
// the dropdown arrow and list, but never blocks or warns on a value typed
// that isn't in it; the real check happens server-side on upload, same as
// every other column already works today.
//
// Writes ONE model entry keyed by the whole range string (via
// `sheet.dataValidations.add`), rather than looping `cell.dataValidation =
// ...` once per row. The per-cell-loop approach was tried first and looked
// fine reading the in-memory model back, but round-tripping a real
// generated .xlsx and inspecting its raw sheet XML (not just the object
// model) turned up a real exceljs bug: its own range-merging optimizer
// sorts cell addresses as plain strings ("A10" sorts before "A2"), so a
// 500-row range crossing the 1-digit/2-digit/3-digit row boundary got
// written out as multiple overlapping <dataValidation> ranges instead of
// one clean one. Harmless in practice (Excel tolerates the same rule
// declared twice over the same cells) but needlessly bloats the file.
// Handing exceljs an address that's already a full range sidesteps that
// optimizer entirely — decodeEx() recognizes it as already-a-rectangle and
// emits it as-is.
function applyDropdownColumn(
  sheet: ExcelJS.Worksheet,
  colNumber: number,
  startRow: number,
  endRow: number,
  formulae: string[]
) {
  const validation: ExcelJS.DataValidation = {
    type: "list",
    formulae,
    allowBlank: true,
    showErrorMessage: false,
    showInputMessage: true,
    promptTitle: "Pick from the list, or type your own",
    prompt: "Use the dropdown for an existing value, or just type a different one — it's still checked when you upload.",
  };
  const col = colLetter(colNumber);
  // `Worksheet.dataValidations` is a real, documented-in-source runtime
  // property (lib/doc/worksheet.js, lib/doc/cell.js's own dataValidation
  // setter goes through it) but isn't part of exceljs's own published
  // .d.ts — same class of gap as the Buffer-generics workaround already
  // in lib/bulk-upload/parse.ts. Narrow, local cast rather than `any`
  // everywhere `sheet` is used.
  const dataValidations = (sheet as unknown as { dataValidations: { add(address: string, v: ExcelJS.DataValidation): void } })
    .dataValidations;
  dataValidations.add(`${col}${startRow}:${col}${endRow}`, validation);
}

async function buildItemsWorkbook(supabase: SupabaseClient): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const { data: itemTypes } = await supabase
    .from("item_types")
    .select("description")
    .eq("active", true)
    .order("description");

  addInstructionsSheet(workbook, "Item Master", ITEM_COLUMNS_WITH_EXAMPLE.columns, [
    "Category must be exactly \"Raw Material\" or \"Packaging\" — Finished Product and Packaged Finished Product items are created from the MFR screen (or the MFR bulk template), not here.",
  ]);

  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.items.sheetName);
  addHeaderRow(sheet, ITEM_COLUMNS_WITH_EXAMPLE.columns);
  sheet.addRow(exampleRowValues(ITEM_COLUMNS_WITH_EXAMPLE.columns, ITEM_COLUMNS_WITH_EXAMPLE.example));

  const refSheet = workbook.addWorksheet("Reference");
  addReferenceSheet(refSheet, "Valid Category values", ["Raw Material", "Packaging"]);
  refSheet.addRow([]);
  addReferenceSheet(refSheet, "Valid Unit values", [...UNITS]);
  refSheet.addRow([]);
  addReferenceSheet(
    refSheet,
    "Existing Item Types (must match exactly if used)",
    (itemTypes ?? []).map((t) => t.description)
  );

  return workbook;
}

async function buildVendorsWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  addInstructionsSheet(workbook, "Vendor Master", VENDOR_COLUMNS_WITH_EXAMPLE.columns, []);
  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.vendors.sheetName);
  addHeaderRow(sheet, VENDOR_COLUMNS_WITH_EXAMPLE.columns);
  sheet.addRow(exampleRowValues(VENDOR_COLUMNS_WITH_EXAMPLE.columns, VENDOR_COLUMNS_WITH_EXAMPLE.example));
  return workbook;
}

async function buildItemTypesWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  addInstructionsSheet(workbook, "Item Type Master", ITEM_TYPE_COLUMNS_WITH_EXAMPLE.columns, []);
  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META["item-types"].sheetName);
  addHeaderRow(sheet, ITEM_TYPE_COLUMNS_WITH_EXAMPLE.columns);
  sheet.addRow(exampleRowValues(ITEM_TYPE_COLUMNS_WITH_EXAMPLE.columns, ITEM_TYPE_COLUMNS_WITH_EXAMPLE.example));
  return workbook;
}

async function buildPurchaseWorkbook(supabase: SupabaseClient): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const [{ data: vendors }, { data: rawItems }, { data: packagingItems }] = await Promise.all([
    supabase.from("vendors").select("name").eq("active", true).order("name"),
    supabase.from("items").select("name").eq("category", "raw").eq("active", true).order("name").limit(2000),
    supabase.from("items").select("name").eq("category", "packaging").eq("active", true).order("name").limit(2000),
  ]);
  const vendorNames = (vendors ?? []).map((v) => v.name);
  const rawItemNames = (rawItems ?? []).map((i) => i.name);
  const packagingItemNames = (packagingItems ?? []).map((i) => i.name);
  // One combined, sorted list backs the Item Name dropdown (it has to
  // offer both categories at once — Purchase Type is a separate column,
  // so Excel can't natively swap the Item Name list based on it without
  // an INDIRECT()-style formula, which is fragile and hard to explain to
  // a spreadsheet user). The real category match is still enforced
  // server-side on upload (bulk-upload.ts) regardless of what was picked.
  const allItemNames = [...rawItemNames, ...packagingItemNames].sort((a, b) => a.localeCompare(b));

  addInstructionsSheet(workbook, "Purchase", PURCHASE_COLUMNS_WITH_EXAMPLE.columns, [
    "Each row is one purchase line. To create a purchase order with more than one line, add one row per line and repeat the exact same Vendor Name, Invoice Number, and Invoice Date on every one of those rows — the upload groups rows into one purchase order by matching Vendor Name + Invoice Number exactly.",
    "Every purchase order created this way lands as a Draft, exactly like one entered by hand on the Purchase screen — nothing is pushed to inventory until someone opens it and clicks Final Submit.",
    "Purchase Type must be \"Raw Material\" or \"Packaging Item\", and the Item Name on that row must actually be that category — a Raw Material row can't reference a Packaging item and vice versa. QC Qty / Stability Qty / R&D Qty / Sample Unit only apply to Raw Material lines; leave them blank for Packaging Item lines.",
    "Vendor Name, Item Name, Purchase Type, and Unit all have a dropdown in this template (click the cell, then the small arrow) sourced from what's currently active — but you can still type a value that isn't in the list if you need to; it's checked for real when you upload, same as before.",
    "Vendor Name and Item Name must uniquely identify one active vendor/item — if two vendors or two same-category items share the exact same name, the upload will reject that row and ask you to use a more specific name (or fix the duplicate in Vendor/Item Master first).",
    "Batch numbers are always generated automatically, the same as a line entered by hand — do not add a batch number column.",
  ]);

  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.purchase.sheetName);
  addHeaderRow(sheet, PURCHASE_COLUMNS_WITH_EXAMPLE.columns);
  PURCHASE_COLUMNS_WITH_EXAMPLE.example.forEach((row) => sheet.addRow(exampleRowValues(PURCHASE_COLUMNS_WITH_EXAMPLE.columns, row)));

  // Column positions match PURCHASE_COLUMNS' order 1:1 (1-indexed):
  // 1 Vendor Name, 4 Purchase Type, 5 Item Name, 7 Unit, 11 Sample Unit.
  const dataEndRow = 1 + MAX_UPLOAD_ROWS;
  const unitFormula = [`"${UNITS.join(",")}"`];

  const refSheet = workbook.addWorksheet("Reference");
  addReferenceColumn(refSheet, 1, "Valid Unit values", [...UNITS]);
  addReferenceColumn(refSheet, 2, "Valid Purchase Type values", ["Raw Material", "Packaging Item"]);
  const vendorLastRow = addReferenceColumn(refSheet, 3, "Active Vendor Names", vendorNames);
  addReferenceColumn(refSheet, 4, "Active Raw Material Item Names", rawItemNames);
  addReferenceColumn(refSheet, 5, "Active Packaging Item Names", packagingItemNames);
  const itemLastRow = addReferenceColumn(refSheet, 6, "All Active Item Names (Raw Material + Packaging — dropdown source for Item Name)", allItemNames);

  applyDropdownColumn(sheet, 1, 2, dataEndRow, [`Reference!$C$2:$C$${vendorLastRow}`]);
  applyDropdownColumn(sheet, 4, 2, dataEndRow, ['"Raw Material,Packaging Item"']);
  applyDropdownColumn(sheet, 5, 2, dataEndRow, [`Reference!$F$2:$F$${itemLastRow}`]);
  applyDropdownColumn(sheet, 7, 2, dataEndRow, unitFormula);
  applyDropdownColumn(sheet, 11, 2, dataEndRow, unitFormula);

  return workbook;
}

async function buildEquipmentWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  addInstructionsSheet(workbook, "Instrument / Equipment Master", EQUIPMENT_COLUMNS_WITH_EXAMPLE.columns, []);
  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.equipment.sheetName);
  addHeaderRow(sheet, EQUIPMENT_COLUMNS_WITH_EXAMPLE.columns);
  sheet.addRow(exampleRowValues(EQUIPMENT_COLUMNS_WITH_EXAMPLE.columns, EQUIPMENT_COLUMNS_WITH_EXAMPLE.example));

  const refSheet = workbook.addWorksheet("Reference");
  addReferenceSheet(refSheet, "Valid Calibration Status values", ["Calibrated", "Due", "Not Applicable"]);
  return workbook;
}

async function buildDeadStockWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  addInstructionsSheet(workbook, "Dead Stock Register", DEAD_STOCK_COLUMNS_WITH_EXAMPLE.columns, []);
  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META["dead-stock"].sheetName);
  addHeaderRow(sheet, DEAD_STOCK_COLUMNS_WITH_EXAMPLE.columns);
  sheet.addRow(exampleRowValues(DEAD_STOCK_COLUMNS_WITH_EXAMPLE.columns, DEAD_STOCK_COLUMNS_WITH_EXAMPLE.example));
  return workbook;
}

async function buildMfrWorkbook(supabase: SupabaseClient): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const [{ data: itemTypes }, { data: rawItems }] = await Promise.all([
    supabase.from("item_types").select("description").eq("active", true).order("description"),
    supabase.from("items").select("name").eq("category", "raw").eq("active", true).order("name").limit(2000),
  ]);
  const itemTypeNames = (itemTypes ?? []).map((t) => t.description);
  const rawItemNames = (rawItems ?? []).map((i) => i.name);

  addInstructionsSheet(workbook, "MFR", MFR_COLUMNS_WITH_EXAMPLE.columns, [
    "Each row is either one recipe line or one Manufacturing Process step for the same MFR — never both. Fill Line Item Name / Line Quantity / Line Unit for a recipe line, or Stage / Operation for a process step, and leave the other group blank on that row.",
    "To create an MFR with more than one ingredient and/or more than one process step, add one row per ingredient or step and repeat the exact same MFR Name on every one of those rows — the upload groups rows into one MFR by matching MFR Name text exactly.",
    "Batch Size Qty / Batch Size Unit / Item Type are header-level and required on every row for one MFR — repeat the exact same value on all of them. Procedure Intro / Theoretical Yield % / Permissible Yield % are also header-level but optional: fill each one on any single row for that MFR (commonly the first) and leave it blank on the rest — a DIFFERENT non-blank value on another row for the same MFR is treated as a mistake and rejected.",
    "The Manufacturing Process fields (Procedure Intro, Theoretical Yield %, Permissible Yield %, Stage, Operation) are all optional — leave every one of them blank if you just want the recipe, exactly like today. Process steps are numbered automatically in the order their rows appear in the file.",
    "Only active Raw Material items can be recipe lines (matching what the MFR screen itself offers) — Packaging and Finished Product items cannot.",
    "Batch Size Unit, Item Type, Line Item Name, and Line Unit all have a dropdown in this template (click the cell, then the small arrow) sourced from what's currently active — but you can still type a value that isn't in the list if you need to; it's checked for real when you upload.",
    "Line Item Name must uniquely identify one active Raw Material item — if two active Raw Material items share the exact same name, the upload will reject that row and ask you to use a more specific name (or fix the duplicate in Item Master first).",
    "This also creates the MFR's Finished Product item and its paired Packaged Finished Product item automatically, the same way creating an MFR by hand does.",
  ]);

  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.mfr.sheetName);
  addHeaderRow(sheet, MFR_COLUMNS_WITH_EXAMPLE.columns);
  MFR_COLUMNS_WITH_EXAMPLE.example.forEach((row) => sheet.addRow(exampleRowValues(MFR_COLUMNS_WITH_EXAMPLE.columns, row)));

  // Column positions match MFR_COLUMNS' order 1:1 (1-indexed): 3 Batch
  // Size Unit, 4 Item Type, 8 Line Item Name, 10 Line Unit.
  const dataEndRow = 1 + MAX_UPLOAD_ROWS;
  const unitFormula = [`"${UNITS.join(",")}"`];

  const refSheet = workbook.addWorksheet("Reference");
  addReferenceColumn(refSheet, 1, "Valid Unit values", [...UNITS]);
  const itemTypeLastRow = addReferenceColumn(refSheet, 2, "Existing Item Types", itemTypeNames);
  const rawItemLastRow = addReferenceColumn(refSheet, 3, "Active Raw Material Item Names", rawItemNames);

  applyDropdownColumn(sheet, 3, 2, dataEndRow, unitFormula);
  applyDropdownColumn(sheet, 4, 2, dataEndRow, [`Reference!$B$2:$B$${itemTypeLastRow}`]);
  applyDropdownColumn(sheet, 8, 2, dataEndRow, [`Reference!$C$2:$C$${rawItemLastRow}`]);
  applyDropdownColumn(sheet, 10, 2, dataEndRow, unitFormula);

  return workbook;
}

// Example rows kept next to their column defs so the two can never drift.
const ITEM_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS.items,
  example: ["Ashwagandha Powder", "Raw Material", "", "kg", "Withania somnifera", "", ""],
};
const VENDOR_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS.vendors,
  example: ["Ambadas Vanaushadhalaya", "Pune, Maharashtra", "9800000000", "020-00000000", "vendor@example.com"],
};
const ITEM_TYPE_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS["item-types"],
  example: ["Powder"],
};
const MFR_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS.mfr,
  example: [
    // Recipe lines — Line Item Name/Quantity/Unit filled, Stage/Operation blank.
    ["A. Jatamansi Tail", "100", "ltr", "", "Weigh/measure all raw materials at production level (Batch size 100 ltr)", "100", "98", "Til Taila", "80", "ltr", "", ""],
    ["A. Jatamansi Tail", "100", "ltr", "", "", "", "", "Jatamansi", "20", "kg", "", ""],
    // Manufacturing Process steps — Stage/Operation filled, recipe fields blank.
    ["A. Jatamansi Tail", "100", "ltr", "", "", "", "", "", "", "", "Cleaning", "Clean and sieve Jatamansi to remove foreign matter"],
    ["A. Jatamansi Tail", "100", "ltr", "", "", "", "", "", "", "", "Preparation of Kwath", "Boil Til Taila with Jatamansi as per SOP until moisture content is nil"],
  ],
};
const PURCHASE_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS.purchase,
  example: [
    ["Ambadas Vanaushadhalaya", "INV-2026-0091", "2026-09-10", "Raw Material", "Jatamansi", "20", "kg", "0.5", "0.2", "0.1", "", "450", "5"],
    ["Ambadas Vanaushadhalaya", "INV-2026-0091", "2026-09-10", "Packaging Item", "White Cap 28 mm", "500", "count", "", "", "", "", "3.2", "18"],
  ],
};
const EQUIPMENT_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS.equipment,
  example: ["Analytical Balance", "R-101", "QC Lab", "", "1", "Calibrated", "2026-06-01", "2027-06-01"],
};
const DEAD_STOCK_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS["dead-stock"],
  example: ["Old HPLC Column", "2022-03-15", "1", "12000", "25", "", "0", "0", "", "", ""],
};

export async function buildTemplateWorkbook(
  module: BulkUploadModuleKey,
  supabase: SupabaseClient
): Promise<ExcelJS.Workbook> {
  switch (module) {
    case "items":
      return buildItemsWorkbook(supabase);
    case "vendors":
      return buildVendorsWorkbook();
    case "item-types":
      return buildItemTypesWorkbook();
    case "mfr":
      return buildMfrWorkbook(supabase);
    case "purchase":
      return buildPurchaseWorkbook(supabase);
    case "equipment":
      return buildEquipmentWorkbook();
    case "dead-stock":
      return buildDeadStockWorkbook();
  }
}

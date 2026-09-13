import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UNITS } from "@/lib/constants/units";
import {
  BULK_UPLOAD_MODULE_META,
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
    supabase.from("vendors").select("vendor_code, name").eq("active", true).order("vendor_code"),
    supabase.from("items").select("item_code, name").eq("category", "raw").eq("active", true).order("item_code").limit(2000),
    supabase.from("items").select("item_code, name").eq("category", "packaging").eq("active", true).order("item_code").limit(2000),
  ]);

  addInstructionsSheet(workbook, "Purchase", PURCHASE_COLUMNS_WITH_EXAMPLE.columns, [
    "Each row is one purchase line. To create a purchase order with more than one line, add one row per line and repeat the exact same Vendor Code, Invoice Number, and Invoice Date on every one of those rows — the upload groups rows into one purchase order by matching Vendor Code + Invoice Number exactly.",
    "Every purchase order created this way lands as a Draft, exactly like one entered by hand on the Purchase screen — nothing is pushed to inventory until someone opens it and clicks Final Submit.",
    "Purchase Type must be \"Raw Material\" or \"Packaging Item\", and the Item Code on that row must actually be that category — a Raw Material row can't reference a Packaging item and vice versa. QC Qty / Stability Qty / R&D Qty / Sample Unit only apply to Raw Material lines; leave them blank for Packaging Item lines.",
    "Batch numbers are always generated automatically, the same as a line entered by hand — do not add a batch number column.",
  ]);

  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.purchase.sheetName);
  addHeaderRow(sheet, PURCHASE_COLUMNS_WITH_EXAMPLE.columns);
  PURCHASE_COLUMNS_WITH_EXAMPLE.example.forEach((row) => sheet.addRow(exampleRowValues(PURCHASE_COLUMNS_WITH_EXAMPLE.columns, row)));

  const refSheet = workbook.addWorksheet("Reference");
  addReferenceSheet(refSheet, "Valid Unit values", [...UNITS]);
  refSheet.addRow([]);
  addReferenceSheet(
    refSheet,
    "Active Vendor codes (for Vendor Code)",
    (vendors ?? []).map((v) => `${v.vendor_code} — ${v.name}`)
  );
  refSheet.addRow([]);
  addReferenceSheet(
    refSheet,
    "Active Raw Material item codes (for Item Code, Purchase Type \"Raw Material\")",
    (rawItems ?? []).map((i) => `${i.item_code} — ${i.name}`)
  );
  refSheet.addRow([]);
  addReferenceSheet(
    refSheet,
    "Active Packaging item codes (for Item Code, Purchase Type \"Packaging Item\")",
    (packagingItems ?? []).map((i) => `${i.item_code} — ${i.name}`)
  );

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
    supabase
      .from("items")
      .select("item_code, name")
      .eq("category", "raw")
      .eq("active", true)
      .order("item_code")
      .limit(2000),
  ]);

  addInstructionsSheet(workbook, "MFR", MFR_COLUMNS_WITH_EXAMPLE.columns, [
    "Each row is one recipe line. To create an MFR with more than one ingredient, add one row per ingredient and repeat the exact same MFR Name (and the same Batch Size Qty / Batch Size Unit / Item Type) on every one of those rows — the upload groups rows into one MFR by matching MFR Name text exactly.",
    "Only active Raw Material items can be recipe lines (matching what the MFR screen itself offers) — Packaging and Finished Product items cannot.",
    "This also creates the MFR's Finished Product item and its paired Packaged Finished Product item automatically, the same way creating an MFR by hand does.",
  ]);

  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.mfr.sheetName);
  addHeaderRow(sheet, MFR_COLUMNS_WITH_EXAMPLE.columns);
  MFR_COLUMNS_WITH_EXAMPLE.example.forEach((row) => sheet.addRow(exampleRowValues(MFR_COLUMNS_WITH_EXAMPLE.columns, row)));

  const refSheet = workbook.addWorksheet("Reference");
  addReferenceSheet(refSheet, "Valid Unit values", [...UNITS]);
  refSheet.addRow([]);
  addReferenceSheet(
    refSheet,
    "Existing Item Types (must match exactly if used)",
    (itemTypes ?? []).map((t) => t.description)
  );
  refSheet.addRow([]);
  addReferenceSheet(
    refSheet,
    "Active Raw Material item codes (for Line Item Code)",
    (rawItems ?? []).map((i) => `${i.item_code} — ${i.name}`)
  );

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
    ["A. Jatamansi Tail", "100", "ltr", "", "RM-00002", "20", "kg"],
    ["A. Jatamansi Tail", "100", "ltr", "", "RM-00005", "5", "ltr"],
  ],
};
const PURCHASE_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS.purchase,
  example: [
    ["V-00001", "INV-2026-0091", "2026-09-10", "Raw Material", "RM-00002", "20", "kg", "0.5", "0.2", "0.1", "", "450", "5"],
    ["V-00001", "INV-2026-0091", "2026-09-10", "Packaging Item", "PK-00007", "500", "count", "", "", "", "", "3.2", "18"],
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

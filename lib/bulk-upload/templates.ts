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
  sheet.addRow(ITEM_COLUMNS_WITH_EXAMPLE.example);

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
  sheet.addRow(VENDOR_COLUMNS_WITH_EXAMPLE.example);
  return workbook;
}

async function buildItemTypesWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  addInstructionsSheet(workbook, "Item Type Master", ITEM_TYPE_COLUMNS_WITH_EXAMPLE.columns, []);
  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META["item-types"].sheetName);
  addHeaderRow(sheet, ITEM_TYPE_COLUMNS_WITH_EXAMPLE.columns);
  sheet.addRow(ITEM_TYPE_COLUMNS_WITH_EXAMPLE.example);
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
  MFR_COLUMNS_WITH_EXAMPLE.example.forEach((row) => sheet.addRow(row));

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
  }
}

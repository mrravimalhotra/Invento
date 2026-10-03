import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { UNITS } from "@/lib/constants/units";
import {
  BULK_UPLOAD_MODULE_META,
  MAX_UPLOAD_ROWS,
  MODULE_COLUMNS,
  MFR_RECIPE_COLUMNS,
  MFR_PROCEDURE_COLUMNS,
  MFR_PROCEDURE_SHEET_NAME,
  type BulkUploadModuleKey,
  type ColumnDef,
} from "./schemas";
import { EXAMPLE_ROWS } from "./examples";

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

// ACC-23: example rows are written in grey italics and the upload skips a
// row that still matches its example exactly, so leaving them in is harmless.
function addExampleRows(sheet: ExcelJS.Worksheet, columns: ColumnDef[], rows: string[][]) {
  rows.forEach((values) => {
    const row = sheet.addRow(exampleRowValues(columns, values));
    row.font = { italic: true, color: { argb: "FF808080" } };
  });
}

export const EXAMPLE_ROW_NOTE =
  "The grey italic example row(s) in the data sheet show the expected format. They are ignored on upload as long as they are left unchanged, so you can keep or delete them.";

const DATE_NOTE =
  "Dates: type them as real Excel dates, or as text in dd-mm-yyyy (e.g. 05-09-2026) or yyyy-mm-dd form. Any other date format is rejected rather than guessed. Percentage columns take a plain number (18 for 18%); \"18%\" is also accepted.";

// `columnSections` is normally one section (every module except MFR has
// exactly one data sheet) — a bare `heading` means "just list the columns
// under a plain 'Column notes:' header," same output this always had.
// MFR (20 Sept 2026, two sheets — Recipe / Manufacturing Procedure) passes
// two sections, each with its own heading, so the Instructions sheet
// still tells you plainly which columns belong to which of the two data
// sheets rather than one undifferentiated list.
function addInstructionsSheet(
  workbook: ExcelJS.Workbook,
  title: string,
  columnSections: { heading?: string; columns: ColumnDef[] }[],
  extraNotes: string[]
) {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.columns = [{ width: 100 }];
  const lines = [
    `${title} — bulk upload template`,
    "",
    "Fill in the sheet(s) with this template's own name(s) (not this Instructions sheet), one row per record. Columns marked with * are required.",
    "Do not rename, reorder, or delete the header row — the upload reads columns by their header text.",
    "A code (item code / vendor code / MFR code) is always generated automatically when the file is imported — do not add or fill in a code column.",
    EXAMPLE_ROW_NOTE,
    ...extraNotes,
    "",
    ...columnSections.flatMap((section) => [
      section.heading ? `${section.heading} column notes:` : "Column notes:",
      ...section.columns.map((c) => `• ${c.header}${c.required ? " (required)" : ""}${c.hint ? " — " + c.hint : ""}`),
      "",
    ]),
  ];
  lines.forEach((line) => {
    const row = sheet.addRow([line]);
    if (line.endsWith("template") || line.endsWith("column notes:") || line === "Column notes:") row.font = { bold: true };
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

  addInstructionsSheet(workbook, "Item Master", [{ columns: ITEM_COLUMNS_WITH_EXAMPLE.columns }], [
    "Category must be exactly \"Raw Material\" or \"Packaging\" — Finished Product and Packaged Finished Product items are created automatically when an MFR is approved, not here.",
    "Item Type is required for every Raw Material row (pick from the Reference sheet); it may be left blank for Packaging. Unit is required on every row.",
  ]);

  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.items.sheetName);
  addHeaderRow(sheet, ITEM_COLUMNS_WITH_EXAMPLE.columns);
  addExampleRows(sheet, ITEM_COLUMNS_WITH_EXAMPLE.columns, ITEM_COLUMNS_WITH_EXAMPLE.example);

  const refSheet = workbook.addWorksheet("Reference");
  addReferenceSheet(refSheet, "Valid Category values", ["Raw Material", "Packaging"]);
  refSheet.addRow([]);
  addReferenceSheet(refSheet, "Valid Unit values", [...UNITS]);
  refSheet.addRow([]);
  addReferenceSheet(
    refSheet,
    "Existing Item Types (must match exactly; required for Raw Material)",
    (itemTypes ?? []).map((t) => t.description)
  );

  return workbook;
}

async function buildVendorsWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  addInstructionsSheet(workbook, "Vendor Master", [{ columns: VENDOR_COLUMNS_WITH_EXAMPLE.columns }], []);
  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.vendors.sheetName);
  addHeaderRow(sheet, VENDOR_COLUMNS_WITH_EXAMPLE.columns);
  addExampleRows(sheet, VENDOR_COLUMNS_WITH_EXAMPLE.columns, VENDOR_COLUMNS_WITH_EXAMPLE.example);
  return workbook;
}

async function buildItemTypesWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  addInstructionsSheet(workbook, "Item Type Master", [{ columns: ITEM_TYPE_COLUMNS_WITH_EXAMPLE.columns }], []);
  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META["item-types"].sheetName);
  addHeaderRow(sheet, ITEM_TYPE_COLUMNS_WITH_EXAMPLE.columns);
  addExampleRows(sheet, ITEM_TYPE_COLUMNS_WITH_EXAMPLE.columns, ITEM_TYPE_COLUMNS_WITH_EXAMPLE.example);
  return workbook;
}

async function buildPurchaseWorkbook(supabase: SupabaseClient): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const [{ data: vendors }, { data: rawItems }, { data: packagingItems }] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("vendors").select("name").eq("active", true).order("name", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("items").select("name").eq("category", "raw").eq("active", true).order("name", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("items").select("name").eq("category", "packaging").eq("active", true).order("name", { ascending: true }).order("id", { ascending: true }).range(from, to)),
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

  addInstructionsSheet(workbook, "Purchase", [{ columns: PURCHASE_COLUMNS_WITH_EXAMPLE.columns }], [
    DATE_NOTE,
    "Each row is one purchase line. To create a purchase order with more than one line, add one row per line and repeat the exact same Vendor Name, Invoice Number, and Invoice Date on every one of those rows — the upload groups rows into one purchase order by matching Vendor Name + Invoice Number exactly.",
    "Every purchase order created this way lands as a Draft, exactly like one entered by hand on the Purchase screen — nothing is pushed to inventory until someone opens it and clicks Final Submit.",
    "Purchase Type must be \"Raw Material\" or \"Packaging Item\", and the Item Name on that row must actually be that category — a Raw Material row can't reference a Packaging item and vice versa. QC Qty / Stability Qty / R&D Qty / Sample Unit only apply to Raw Material lines; leave them blank for Packaging Item lines.",
    "QC Qty, Stability Qty, and R&D Qty are mandatory on every Raw Material line — a blank cell is rejected. Enter 0 if that line genuinely needs no sample of a given kind; 0 is a valid, deliberate answer, blank is not.",
    "Vendor Name, Item Name, Purchase Type, and Unit all have a dropdown in this template (click the cell, then the small arrow) sourced from what's currently active — but you can still type a value that isn't in the list if you need to; it's checked for real when you upload, same as before.",
    "Vendor Name and Item Name must uniquely identify one active vendor/item — if two vendors or two same-category items share the exact same name, the upload will reject that row and ask you to use a more specific name (or fix the duplicate in Vendor/Item Master first).",
    "Batch numbers are always generated automatically, the same as a line entered by hand — do not add a batch number column.",
  ]);

  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.purchase.sheetName);
  addHeaderRow(sheet, PURCHASE_COLUMNS_WITH_EXAMPLE.columns);
  addExampleRows(sheet, PURCHASE_COLUMNS_WITH_EXAMPLE.columns, PURCHASE_COLUMNS_WITH_EXAMPLE.example);

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
  addInstructionsSheet(workbook, "Instrument / Equipment Master", [{ columns: EQUIPMENT_COLUMNS_WITH_EXAMPLE.columns }], [DATE_NOTE]);
  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.equipment.sheetName);
  addHeaderRow(sheet, EQUIPMENT_COLUMNS_WITH_EXAMPLE.columns);
  addExampleRows(sheet, EQUIPMENT_COLUMNS_WITH_EXAMPLE.columns, EQUIPMENT_COLUMNS_WITH_EXAMPLE.example);

  const refSheet = workbook.addWorksheet("Reference");
  addReferenceSheet(refSheet, "Valid Calibration Status values", ["Calibrated", "Due", "Not Applicable"]);
  return workbook;
}

async function buildDeadStockWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  addInstructionsSheet(workbook, "Dead Stock Register", [{ columns: DEAD_STOCK_COLUMNS_WITH_EXAMPLE.columns }], [DATE_NOTE]);
  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META["dead-stock"].sheetName);
  addHeaderRow(sheet, DEAD_STOCK_COLUMNS_WITH_EXAMPLE.columns);
  addExampleRows(sheet, DEAD_STOCK_COLUMNS_WITH_EXAMPLE.columns, DEAD_STOCK_COLUMNS_WITH_EXAMPLE.example);
  return workbook;
}

// Two data sheets (20 Sept 2026, Ravi: "divide this into two sheets one
// for recipe and the other one for procedure. Only required columns
// should be part of each of these") — Recipe (always required) and
// Manufacturing Procedure (fully optional), matching this app's own UI
// section names for the two. See MFR_RECIPE_COLUMNS/MFR_PROCEDURE_COLUMNS
// in schemas.ts and bulkUploadMfr() in lib/actions/bulk-upload.ts for the
// full reasoning and how the two are joined back together by MFR Name.
async function buildMfrWorkbook(supabase: SupabaseClient): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const [{ data: itemTypes }, { data: rawItems }] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("item_types").select("description").eq("active", true).order("description", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("items").select("name").eq("category", "raw").eq("active", true).order("name", { ascending: true }).order("id", { ascending: true }).range(from, to)),
  ]);
  const itemTypeNames = (itemTypes ?? []).map((t) => t.description);
  const rawItemNames = (rawItems ?? []).map((i) => i.name);

  addInstructionsSheet(
    workbook,
    "MFR",
    [
      { heading: "Recipe sheet", columns: MFR_RECIPE_COLUMNS_WITH_EXAMPLE.columns },
      { heading: "Manufacturing Procedure sheet", columns: MFR_PROCEDURE_COLUMNS_WITH_EXAMPLE.columns },
    ],
    [
      "This template has two data sheets: Recipe and Manufacturing Procedure. Every MFR needs at least one row on the Recipe sheet (one row per ingredient); Manufacturing Procedure is optional — leave it with no rows for that MFR if you only want the recipe.",
      "Both sheets are joined by MFR Name: repeat the exact same MFR Name text on every row (on either sheet) that belongs to the same MFR. Every MFR Name used on the Manufacturing Procedure sheet must already appear on the Recipe sheet.",
      "Batch Size Qty / Batch Size Unit / Item Type live only on the Recipe sheet and are required on every row for one MFR — repeat the exact same value on all of them.",
      "Procedure Intro / Theoretical Yield % / Permissible Yield % live only on the Manufacturing Procedure sheet and are optional: fill each one on any single row for that MFR (commonly the first) and leave it blank on the rest — a DIFFERENT non-blank value on another row for the same MFR is treated as a mistake and rejected. Procedure steps (Stage + Operation) are numbered automatically in the order their rows appear in the file.",
      "Only active Raw Material items can be recipe lines (matching what the MFR screen itself offers) — Packaging and Finished Product items cannot.",
      "On the Recipe sheet, Batch Size Unit, Item Type, Line Item Name, and Line Unit all have a dropdown in this template (click the cell, then the small arrow) sourced from what's currently active — but you can still type a value that isn't in the list if you need to; it's checked for real when you upload.",
      "Line Item Name must uniquely identify one active Raw Material item — if two active Raw Material items share the exact same name, the upload will reject that row and ask you to use a more specific name (or fix the duplicate in Item Master first).",
      "Each MFR lands unapproved, exactly like one created by hand. Its Finished Product item and paired Packaged Finished Product item are created when the MFR is approved (on its own MFR page), so an MFR that is never approved uses up no item codes.",
    ]
  );

  const recipeSheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META.mfr.sheetName);
  addHeaderRow(recipeSheet, MFR_RECIPE_COLUMNS_WITH_EXAMPLE.columns);
  addExampleRows(recipeSheet, MFR_RECIPE_COLUMNS_WITH_EXAMPLE.columns, MFR_RECIPE_COLUMNS_WITH_EXAMPLE.example);

  const procedureSheet = workbook.addWorksheet(MFR_PROCEDURE_SHEET_NAME);
  addHeaderRow(procedureSheet, MFR_PROCEDURE_COLUMNS_WITH_EXAMPLE.columns);
  addExampleRows(procedureSheet, MFR_PROCEDURE_COLUMNS_WITH_EXAMPLE.columns, MFR_PROCEDURE_COLUMNS_WITH_EXAMPLE.example);

  const dataEndRow = 1 + MAX_UPLOAD_ROWS;
  const unitFormula = [`"${UNITS.join(",")}"`];

  const refSheet = workbook.addWorksheet("Reference");
  addReferenceColumn(refSheet, 1, "Valid Unit values", [...UNITS]);
  const itemTypeLastRow = addReferenceColumn(refSheet, 2, "Existing Item Types", itemTypeNames);
  const rawItemLastRow = addReferenceColumn(refSheet, 3, "Active Raw Material Item Names", rawItemNames);

  // Recipe sheet column positions match MFR_RECIPE_COLUMNS' order 1:1
  // (1-indexed): 3 Batch Size Unit, 4 Item Type, 5 Line Item Name, 7 Line Unit.
  applyDropdownColumn(recipeSheet, 3, 2, dataEndRow, unitFormula);
  applyDropdownColumn(recipeSheet, 4, 2, dataEndRow, [`Reference!$B$2:$B$${itemTypeLastRow}`]);
  applyDropdownColumn(recipeSheet, 5, 2, dataEndRow, [`Reference!$C$2:$C$${rawItemLastRow}`]);
  applyDropdownColumn(recipeSheet, 7, 2, dataEndRow, unitFormula);

  return workbook;
}

// Example rows kept next to their column defs so the two can never drift.
const ITEM_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS.items,
  example: EXAMPLE_ROWS["items"],
};
const VENDOR_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS.vendors,
  example: EXAMPLE_ROWS["vendors"],
};
const ITEM_TYPE_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS["item-types"],
  example: EXAMPLE_ROWS["item-types"],
};
// Two sheets, two example sets (20 Sept 2026, Recipe / Manufacturing
// Procedure split — see MFR_RECIPE_COLUMNS/MFR_PROCEDURE_COLUMNS in
// schemas.ts). Same underlying A. Jatamansi Tail example as before the
// split, just laid out across two sheets instead of one flat one, joined
// by the repeated MFR Name.
const MFR_RECIPE_COLUMNS_WITH_EXAMPLE = {
  columns: MFR_RECIPE_COLUMNS,
  example: EXAMPLE_ROWS["mfr-recipe"],
};
const MFR_PROCEDURE_COLUMNS_WITH_EXAMPLE = {
  columns: MFR_PROCEDURE_COLUMNS,
  example: EXAMPLE_ROWS["mfr-procedure"],
};
const PURCHASE_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS.purchase,
  example: EXAMPLE_ROWS["purchase"],
};
const EQUIPMENT_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS.equipment,
  example: EXAMPLE_ROWS["equipment"],
};
const DEAD_STOCK_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS["dead-stock"],
  example: EXAMPLE_ROWS["dead-stock"],
};

// COA Templates (22 Sept 2026, reworked 3 Oct 2026). One row per
// Test/Specification line, grouped by repeating the same Code — the Item
// Code of a raw material or the Code of an MFR (templates belong to each
// raw material and each MFR now, not to an Item Type). Create-only: a code
// that already has a template is rejected, not overwritten.
async function buildCoaTemplatesWorkbook(supabase: SupabaseClient): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const [{ data: rawItems }, { data: mfrs }, { data: existingTemplates }] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("items").select("id, item_code, name").eq("category", "raw").eq("active", true).order("item_code", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("mfr_definitions").select("id, code, name").eq("active", true).order("code", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("coa_templates").select("item_id, mfr_definition_id").order("id", { ascending: true }).range(from, to)),
  ]);
  // The dropdown only offers codes that do not have a template yet — the
  // upload rejects the others anyway.
  const templatedItemIds = new Set((existingTemplates ?? []).map((t) => t.item_id).filter(Boolean));
  const templatedMfrIds = new Set((existingTemplates ?? []).map((t) => t.mfr_definition_id).filter(Boolean));
  const available = [
    ...(rawItems ?? []).filter((i) => !templatedItemIds.has(i.id)).map((i) => i.item_code),
    ...(mfrs ?? []).filter((m) => !templatedMfrIds.has(m.id)).map((m) => m.code),
  ];
  const labels = [
    ...(rawItems ?? []).filter((i) => !templatedItemIds.has(i.id)).map((i) => `${i.item_code} — ${i.name}`),
    ...(mfrs ?? []).filter((m) => !templatedMfrIds.has(m.id)).map((m) => `${m.code} — ${m.name}`),
  ];

  addInstructionsSheet(workbook, "COA Templates", [{ columns: COA_TEMPLATE_COLUMNS_WITH_EXAMPLE.columns }], [
    "Each row is one Test/Specification line. To define a template with more than one test, add one row per test and repeat the exact same Code on every one of those rows — the upload groups rows into one template.",
    "Code is the Item Code of a raw material (for example RM-001) or the Code of an MFR (for example MFR-0001). The Reference sheet lists the codes that do not have a template yet, with their names.",
    "A code that already has a COA template is rejected — edit it on the item or MFR page (or see the COA Template Register) instead of re-uploading it here.",
  ]);

  const sheet = workbook.addWorksheet(BULK_UPLOAD_MODULE_META["coa-templates"].sheetName);
  addHeaderRow(sheet, COA_TEMPLATE_COLUMNS_WITH_EXAMPLE.columns);
  addExampleRows(sheet, COA_TEMPLATE_COLUMNS_WITH_EXAMPLE.columns, COA_TEMPLATE_COLUMNS_WITH_EXAMPLE.example);

  const dataEndRow = 1 + MAX_UPLOAD_ROWS;
  const refSheet = workbook.addWorksheet("Reference");
  const codeLastRow = addReferenceColumn(refSheet, 1, "Codes without a COA template", available);
  addReferenceColumn(refSheet, 2, "Name", labels);

  // Column 1 = Code (COA_TEMPLATE_COLUMNS' only dropdown-eligible column).
  applyDropdownColumn(sheet, 1, 2, dataEndRow, [`Reference!$A$2:$A$${codeLastRow}`]);

  return workbook;
}

const COA_TEMPLATE_COLUMNS_WITH_EXAMPLE = {
  columns: MODULE_COLUMNS["coa-templates"],
  example: EXAMPLE_ROWS["coa-templates"],
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
    case "coa-templates":
      return buildCoaTemplatesWorkbook(supabase);
  }
}

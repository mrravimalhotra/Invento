// Bulk data upload — shared column definitions.
//
// Single source of truth for both sides of the round trip: the template
// generator (app/api/bulk-upload/template/[module]/route.ts) writes these
// exact header strings into the downloadable .xlsx, and the upload parser
// (lib/actions/bulk-upload.ts) looks for these exact header strings (case-
// insensitively, trimmed) in whatever file comes back. Keeping both in one
// place means the two can never quietly drift apart.
//
// Scope (Ravi, 13 Sept 2026, via AskUserQuestion): Item Master, Vendor
// Master, Item Type Master, and MFR — pure master/setup data with no
// ledger or workflow side effects. Purchase was deliberately left out of
// this first pass; it's a materially more complex multi-table shape (PO
// header + GST/pricing lines that push real inventory_ledger rows) and
// was left for a later, separately-scoped pass rather than folded in
// here.
//
// Purchase, Instrument/Equipment Master, and Dead Stock Register added
// 13 Sept 2026 (Ravi: "can we have purchase, instrument and dead stock
// entries done as excel as part of bulk upload utility we created").
// Equipment and Dead Stock are flat, single-table master data — no
// cross-table references, same shape as Vendor Master. Purchase is the
// complex one flagged above: scoped via AskUserQuestion to land every
// bulk-uploaded purchase order as a Draft (same as one entered by hand —
// nothing touches inventory until Final Submit), never auto-submitted by
// the upload itself. See lib/actions/bulk-upload.ts and
// supabase/migrations/0038_bulk_upload_purchase.sql.

// "coa-templates" added 22 Sept 2026 (Ravi: "we want to automate data
// upload of this screen per item type" — the COA Template edit screen,
// app/(dashboard)/coa/templates/[itemTypeId]/page.tsx, whose three fields
// are Item Type, Test, and Specification). Note this is templates only
// (the Test/Specification list a certificate is generated FROM) — a
// materially different, simpler thing than bulk-generating actual
// certificates against batches, which was the first (and wrong) reading
// of Ravi's earlier, less specific "bulk upload Certificate of Analysis"
// request; this screenshot-backed follow-up superseded that.
export const BULK_UPLOAD_MODULES = ["items", "vendors", "item-types", "mfr", "purchase", "equipment", "dead-stock", "coa-templates"] as const;
export type BulkUploadModuleKey = (typeof BULK_UPLOAD_MODULES)[number];

// `numeric: true` marks a column whose values are plain numbers (never
// letters or punctuation like a hyphen) — templates.ts writes that
// column's example-row cell as a real Excel number, not text, so Excel
// doesn't flag it with its "Number Stored as Text" warning (Ravi, 13
// Sept 2026, with a screenshot of exactly that warning on the Vendor
// Master template's Mobile example cell: "All templates should have
// numbers stored as number not number stored as string"). Left off
// columns that can legitimately contain non-digit characters (Phone's
// example has a hyphen, "020-00000000") or where the value is really a
// code/label even though it looks numeric (Batch Size Unit, item/vendor
// codes) — those stay text so a leading zero or punctuation is never
// silently dropped.
//
// `percent: true` marks a column holding a percentage entered as a plain
// number (18 = 18%). "18%" typed as text is accepted and read as 18 (ACC-23).
export type ColumnDef = { header: string; required: boolean; hint?: string; numeric?: boolean; percent?: boolean };

export const BULK_UPLOAD_MODULE_META: Record<
  BulkUploadModuleKey,
  { title: string; sheetName: string; fileBaseName: string; module: "items" | "vendors" | "item_types" | "mfr" | "purchase" | "equipment" | "dead_stock" | "coa" }
> = {
  items: { title: "Item Master", sheetName: "Item Master", fileBaseName: "item-master-template", module: "items" },
  vendors: { title: "Vendor Master", sheetName: "Vendor Master", fileBaseName: "vendor-master-template", module: "vendors" },
  "item-types": {
    title: "Item Type Master",
    sheetName: "Item Type Master",
    fileBaseName: "item-type-master-template",
    module: "item_types",
  },
  // sheetName here is the Recipe sheet — MFR's other data sheet
  // (Manufacturing Procedure) is named separately in MFR_SHEET_NAMES below,
  // since every other module in this record has exactly one data sheet and
  // this field's shared type only has room for one name.
  mfr: { title: "MFR", sheetName: "Recipe", fileBaseName: "mfr-template", module: "mfr" },
  purchase: { title: "Purchase", sheetName: "Purchase", fileBaseName: "purchase-template", module: "purchase" },
  equipment: {
    title: "Instrument / Equipment Master",
    sheetName: "Equipment Master",
    fileBaseName: "equipment-master-template",
    module: "equipment",
  },
  "dead-stock": {
    title: "Dead Stock Register",
    sheetName: "Dead Stock Register",
    fileBaseName: "dead-stock-register-template",
    module: "dead_stock",
  },
  "coa-templates": {
    title: "COA Templates",
    sheetName: "COA Templates",
    fileBaseName: "coa-templates-template",
    module: "coa",
  },
};

// Item codes are ALWAYS auto-generated on insert (Ravi's explicit choice)
// — any "code" the uploader might type is never read. No code column is
// offered in the template at all, so there's nothing to ignore.
export const ITEM_COLUMNS: ColumnDef[] = [
  { header: "Name", required: true },
  { header: "Category", required: true, hint: "Raw Material or Packaging" },
  { header: "Item Type", required: false, hint: "required for Raw Material; must match an existing Item Type Master description exactly — see the Reference sheet; may be blank for Packaging" },
  { header: "Unit", required: true, hint: "kg, g, mg, ltr, ml, nos, bottle, or pack — see the Reference sheet" },
  { header: "Botanical Name", required: false },
  { header: "Barcode", required: false },
  { header: "Low Stock Threshold", required: false, hint: "a number", numeric: true },
];

export const VENDOR_COLUMNS: ColumnDef[] = [
  { header: "Name", required: true },
  { header: "Address", required: false },
  { header: "Mobile", required: false, numeric: true },
  { header: "Phone", required: false },
  { header: "Email", required: false },
];

export const ITEM_TYPE_COLUMNS: ColumnDef[] = [{ header: "Description", required: true }];

// Line Item Name (not Line Item Code), and dropdowns on Batch Size Unit /
// Item Type / Line Unit — same "similar changes" pattern as Purchase's
// Vendor Name / Item Name (20 Sept 2026, Ravi).
//
// Two sheets, not one (20 Sept 2026, Ravi: "divide this into two sheets
// one for recipe and the other one for procedure. Only required columns
// should be part of each of these"). Originally (same-day, earlier pass)
// Manufacturing Process was added to the same flat MFR sheet as the
// recipe, with one row being either a recipe line OR a procedure step —
// distinguished by which of Line Item Name/Line Quantity/Line Unit vs.
// Stage/Operation were filled, and every column from both groups present
// on every row whether relevant or not. That flat-file ambiguity is
// exactly what this split removes: MFR_RECIPE_COLUMNS below is the
// Recipe sheet (always required — an MFR needs at least one recipe line),
// MFR_PROCEDURE_COLUMNS is the Manufacturing Procedure sheet (fully
// optional — an MFR can have zero procedure-step rows), matching this
// app's own existing UI section names for the two ("Recipe" /
// "Manufacturing Procedure" on `/mfr/[id]`) rather than inventing new
// ones. Each sheet now carries only the columns actually relevant to it:
// Stage/Operation are gone from the Recipe sheet, Line Item Name/Line
// Quantity/Line Unit are gone from the Procedure sheet, and — since a row
// on either sheet unambiguously belongs to that sheet's own kind — the
// three line-level columns that used to be conditionally required
// (blank was valid on a pure procedure-step row) are now simply
// `required: true` on the Recipe sheet, and Stage/Operation are simply
// `required: true` on the Procedure sheet. The header-level fields that
// only ever applied to the recipe (MFR Name, Batch Size Qty/Unit, Item
// Type) live solely on the Recipe sheet; Procedure Intro/Theoretical
// Yield %/Permissible Yield % — genuinely procedure-level, not
// recipe-level — moved to the Procedure sheet, repeating MFR Name as the
// join key back to the matching Recipe-sheet rows (every MFR Name on the
// Procedure sheet must already exist on the Recipe sheet).
export const MFR_RECIPE_COLUMNS: ColumnDef[] = [
  { header: "MFR Name", required: true, hint: "repeat the exact same text on every recipe line row belonging to this MFR" },
  { header: "Batch Size Qty", required: true, hint: "same value on every recipe line row for one MFR", numeric: true },
  { header: "Batch Size Unit", required: true, hint: "same value on every recipe line row for one MFR — pick from the dropdown" },
  { header: "Item Type", required: false, hint: "applies to the Finished Product item created when this MFR is approved — same value on every recipe line row for one MFR; pick from the dropdown, or type a new/different one" },
  { header: "Line Item Name", required: true, hint: "an existing, active Raw Material item name — pick from the dropdown, or type a new/different one" },
  { header: "Line Quantity", required: true, hint: "a number greater than 0", numeric: true },
  { header: "Line Unit", required: true, hint: "pick from the dropdown" },
];

export const MFR_PROCEDURE_COLUMNS: ColumnDef[] = [
  { header: "MFR Name", required: true, hint: "must already appear on the Recipe sheet — this is how a procedure step is matched back to its MFR" },
  { header: "Procedure Intro", required: false, hint: "optional — the standard opening line (e.g. \"Weigh/measure all raw materials at production level\"); fill it on any one row for this MFR and leave it blank on the rest" },
  { header: "Theoretical Yield %", required: false, hint: "optional — fill it on any one row for this MFR and leave it blank on the rest", numeric: true, percent: true },
  { header: "Permissible Yield %", required: false, hint: "optional — the NLT (not less than) minimum; fill it on any one row for this MFR and leave it blank on the rest", numeric: true, percent: true },
  { header: "Stage", required: true, hint: "e.g. Cleaning, Preparation of Kwath" },
  { header: "Operation", required: true, hint: "the operation performed at this stage" },
];

// The Manufacturing Procedure sheet's own name — MFR is the only module
// with two data sheets, so this lives outside BULK_UPLOAD_MODULE_META
// (whose `sheetName` field only has room for one name per module; MFR's
// `sheetName` above is the Recipe sheet).
export const MFR_PROCEDURE_SHEET_NAME = "Manufacturing Procedure";

// Purchase order codes and batch numbers are ALWAYS auto-generated on
// insert, same rule as everywhere else in this feature — no code column
// is offered. One row = one purchase line; several rows sharing the same
// Vendor Name + Invoice Number (which must also repeat the same Invoice
// Date) become one purchase order's lines, the same flat-file grouping
// pattern MFR_COLUMNS above already uses for recipe lines.
//
// Vendor Name / Item Name (not Vendor Code / Item Code), 20 Sept 2026 —
// Ravi: "It should have Vendor Name and Item name instead of Vendor Code
// and Item Code." Vendor Name, Item Name, Purchase Type, and Unit all get
// an Excel dropdown in the generated template (templates.ts) sourced from
// live reference data, but the dropdown never hard-blocks — a value typed
// free-hand that isn't in the list is still accepted by Excel and still
// validated for real server-side, same as before. Matching by name is
// case-insensitive; if a name matches more than one active vendor/item
// (names aren't DB-enforced-unique — see bulk-upload.ts), the row is
// rejected with an error asking for a more specific/unique name rather
// than guessing which one was meant.
export const PURCHASE_COLUMNS: ColumnDef[] = [
  { header: "Vendor Name", required: true, hint: "an existing, active Vendor Master name — pick from the dropdown, or type a new/different one; see the Reference sheet" },
  { header: "Invoice Number", required: true, hint: "repeat the exact same text (and the same Invoice Date) on every line row belonging to this purchase order" },
  { header: "Invoice Date", required: true, hint: "same value on every line row for one purchase order" },
  { header: "Purchase Type", required: true, hint: "Raw Material or Packaging Item — pick from the dropdown" },
  { header: "Item Name", required: true, hint: "an existing, active item name matching Purchase Type — pick from the dropdown, or type a new/different one; see the Reference sheet" },
  { header: "Quantity", required: true, hint: "a number greater than 0", numeric: true },
  { header: "Unit", required: true, hint: "kg, g, mg, ltr, ml, nos, bottle, or pack — pick from the dropdown" },
  { header: "QC Qty", required: false, hint: "Required for Raw Material lines (enter 0 if none needed) — leave blank for Packaging Item lines", numeric: true },
  { header: "Stability Qty", required: false, hint: "Required for Raw Material lines (enter 0 if none needed) — leave blank for Packaging Item lines", numeric: true },
  { header: "R&D Qty", required: false, hint: "Required for Raw Material lines (enter 0 if none needed) — leave blank for Packaging Item lines", numeric: true },
  { header: "Sample Unit", required: false, hint: "unit QC/Stability/R&D Qty are entered in, if different from Unit above — Raw Material lines only, converted to Unit on save; same dropdown as Unit" },
  { header: "Unit Price (₹)", required: false, numeric: true },
  { header: "GST %", required: false, numeric: true, percent: true },
];

export const EQUIPMENT_COLUMNS: ColumnDef[] = [
  { header: "Name", required: true },
  { header: "Room No", required: false },
  { header: "Section", required: false },
  { header: "Asset ID", required: false, hint: "the existing printed/engraved ID tag, if any — holds both legacy and newly assigned IDs" },
  { header: "Quantity", required: false, hint: "a number greater than 0 — defaults to 1 if left blank", numeric: true },
  { header: "Calibration Status", required: false, hint: "Calibrated, Due, or Not Applicable — leave blank if unknown" },
  { header: "Last Calibration Date", required: false },
  { header: "Next Calibration Due", required: false },
];

export const DEAD_STOCK_COLUMNS: ColumnDef[] = [
  { header: "Name of Article", required: true },
  { header: "Date of Purchase", required: false },
  { header: "Quantity", required: false, hint: "a number greater than 0 — defaults to 1 if left blank", numeric: true },
  { header: "Purchase Price (₹)", required: false, numeric: true },
  { header: "Depreciation %", required: false, hint: "a number from 0 to 100 — defaults to 25 if left blank", numeric: true, percent: true },
  { header: "Resolution Date", required: false },
  { header: "Rejected Qty", required: false, hint: "a number ≥ 0 — defaults to 0 if left blank", numeric: true },
  { header: "Rejected Value (₹)", required: false, hint: "a number ≥ 0 — defaults to 0 if left blank", numeric: true },
  { header: "Balance Qty", required: false, numeric: true },
  { header: "Balance Value (₹)", required: false, numeric: true },
  { header: "Remark", required: false },
];

// One row = one Test/Specification line for a COA template. Several rows
// sharing the same Item Type become that item type's template — same
// flat-file grouping pattern MFR_RECIPE_COLUMNS above uses for recipe
// lines, keyed by the repeated identifier instead of a code (item types
// have no code of their own in this app). Seq (S.N. on the template edit
// screen) is always auto-numbered from row order, matching
// upsert_coa_template()'s own "Serial number will be autogenerated" rule
// — no seq/S.N. column is offered.
//
// Deliberately CREATE-only, not create-or-replace: a row whose Item Type
// already has a template is rejected (see bulkUploadCoaTemplates(), which
// checks this before ever calling the RPC) rather than silently
// overwriting whatever tests are already defined there — same "reject an
// existing name" convention every other master-data module in this file
// already uses (Item Type Master's Description, Vendor Master's Name,
// etc.), chosen over silent overwrite per the working agreement's "never
// modify existing data without flagging it first."
export const COA_TEMPLATE_COLUMNS: ColumnDef[] = [
  {
    header: "Item Type",
    required: true,
    hint: "an existing, active Item Type Master description that doesn't already have a COA template — pick from the dropdown, or type a new/different one; see the Reference sheet",
  },
  { header: "Test", required: true },
  { header: "Specification", required: true },
];

// MFR is deliberately excluded here — it's the only module with two data
// sheets (Recipe / Manufacturing Procedure, see MFR_RECIPE_COLUMNS /
// MFR_PROCEDURE_COLUMNS above), so it has no single ColumnDef[] to put in
// a Record shaped one-array-per-module. templates.ts and bulk-upload.ts
// reference MFR_RECIPE_COLUMNS/MFR_PROCEDURE_COLUMNS directly instead.
export const MODULE_COLUMNS: Record<Exclude<BulkUploadModuleKey, "mfr">, ColumnDef[]> = {
  items: ITEM_COLUMNS,
  vendors: VENDOR_COLUMNS,
  "item-types": ITEM_TYPE_COLUMNS,
  purchase: PURCHASE_COLUMNS,
  equipment: EQUIPMENT_COLUMNS,
  "dead-stock": DEAD_STOCK_COLUMNS,
  "coa-templates": COA_TEMPLATE_COLUMNS,
};

// Keeps one request bounded — this is an admin bulk-entry tool, not a
// mass-migration pipeline. Item/Vendor/Item Type/Equipment/Dead Stock
// each need one get_next_*_code() RPC round trip per row before the
// final insert; MFR and Purchase need a handful of statements per group
// (MFR / purchase order) inside their one bulk RPC call. 500 data rows
// is generous for hand-curated master-data entry while keeping
// worst-case request time reasonable — for Purchase specifically, that's
// 500 purchase LINES per file (not 500 purchase orders); for MFR
// (20 Sept 2026, two sheets), this cap applies independently to each of
// the Recipe and Manufacturing Procedure sheets (500 recipe lines AND up
// to 500 procedure steps, not one combined 500 counting both).
export const MAX_UPLOAD_ROWS = 500;

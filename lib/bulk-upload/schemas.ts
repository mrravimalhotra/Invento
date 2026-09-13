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

export const BULK_UPLOAD_MODULES = ["items", "vendors", "item-types", "mfr", "purchase", "equipment", "dead-stock"] as const;
export type BulkUploadModuleKey = (typeof BULK_UPLOAD_MODULES)[number];

export type ColumnDef = { header: string; required: boolean; hint?: string };

export const BULK_UPLOAD_MODULE_META: Record<
  BulkUploadModuleKey,
  { title: string; sheetName: string; fileBaseName: string; module: "items" | "vendors" | "item_types" | "mfr" | "purchase" | "equipment" | "dead_stock" }
> = {
  items: { title: "Item Master", sheetName: "Item Master", fileBaseName: "item-master-template", module: "items" },
  vendors: { title: "Vendor Master", sheetName: "Vendor Master", fileBaseName: "vendor-master-template", module: "vendors" },
  "item-types": {
    title: "Item Type Master",
    sheetName: "Item Type Master",
    fileBaseName: "item-type-master-template",
    module: "item_types",
  },
  mfr: { title: "MFR", sheetName: "MFR", fileBaseName: "mfr-template", module: "mfr" },
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
};

// Item codes are ALWAYS auto-generated on insert (Ravi's explicit choice)
// — any "code" the uploader might type is never read. No code column is
// offered in the template at all, so there's nothing to ignore.
export const ITEM_COLUMNS: ColumnDef[] = [
  { header: "Name", required: true },
  { header: "Category", required: true, hint: "Raw Material or Packaging" },
  { header: "Item Type", required: false, hint: "must match an existing Item Type Master description exactly — see the Reference sheet; leave blank if none" },
  { header: "Unit", required: false, hint: "kg, g, mg, ltr, ml, count, bottle, or pack — see the Reference sheet" },
  { header: "Botanical Alias", required: false },
  { header: "Barcode", required: false },
  { header: "Low Stock Threshold", required: false, hint: "a number" },
];

export const VENDOR_COLUMNS: ColumnDef[] = [
  { header: "Name", required: true },
  { header: "Address", required: false },
  { header: "Mobile", required: false },
  { header: "Phone", required: false },
  { header: "Email", required: false },
];

export const ITEM_TYPE_COLUMNS: ColumnDef[] = [{ header: "Description", required: true }];

export const MFR_COLUMNS: ColumnDef[] = [
  { header: "MFR Name", required: true, hint: "repeat the exact same text on every line row belonging to this MFR" },
  { header: "Batch Size Qty", required: true, hint: "same value on every line row for one MFR" },
  { header: "Batch Size Unit", required: true, hint: "same value on every line row for one MFR — see the Reference sheet" },
  { header: "Item Type", required: false, hint: "applies to the Finished Product item this MFR creates — same value on every line row for one MFR; must match an existing Item Type Master description" },
  { header: "Line Item Code", required: true, hint: "an existing, active Raw Material item code — see the Reference sheet" },
  { header: "Line Quantity", required: true, hint: "a number greater than 0" },
  { header: "Line Unit", required: true, hint: "kg, g, mg, ltr, ml, count, bottle, or pack" },
];

// Purchase order codes and batch numbers are ALWAYS auto-generated on
// insert, same rule as everywhere else in this feature — no code column
// is offered. One row = one purchase line; several rows sharing the same
// Vendor Code + Invoice Number (which must also repeat the same Invoice
// Date) become one purchase order's lines, the same flat-file grouping
// pattern MFR_COLUMNS above already uses for recipe lines.
export const PURCHASE_COLUMNS: ColumnDef[] = [
  { header: "Vendor Code", required: true, hint: "an existing, active Vendor Master code — see the Reference sheet" },
  { header: "Invoice Number", required: true, hint: "repeat the exact same text (and the same Invoice Date) on every line row belonging to this purchase order" },
  { header: "Invoice Date", required: true, hint: "same value on every line row for one purchase order" },
  { header: "Purchase Type", required: true, hint: "Raw Material or Packaging Item" },
  { header: "Item Code", required: true, hint: "an existing, active item code matching Purchase Type — see the Reference sheet" },
  { header: "Quantity", required: true, hint: "a number greater than 0" },
  { header: "Unit", required: true, hint: "kg, g, mg, ltr, ml, count, bottle, or pack — see the Reference sheet" },
  { header: "QC Qty", required: false, hint: "Raw Material lines only — leave blank for Packaging Item lines" },
  { header: "Stability Qty", required: false, hint: "Raw Material lines only — leave blank for Packaging Item lines" },
  { header: "R&D Qty", required: false, hint: "Raw Material lines only — leave blank for Packaging Item lines" },
  { header: "Sample Unit", required: false, hint: "unit QC/Stability/R&D Qty are entered in, if different from Unit above — Raw Material lines only, converted to Unit on save" },
  { header: "Unit Price (₹)", required: false },
  { header: "GST %", required: false },
];

export const EQUIPMENT_COLUMNS: ColumnDef[] = [
  { header: "Name", required: true },
  { header: "Room No", required: false },
  { header: "Section", required: false },
  { header: "Legacy Asset ID", required: false },
  { header: "Quantity", required: false, hint: "a number greater than 0 — defaults to 1 if left blank" },
  { header: "Calibration Status", required: false, hint: "Calibrated, Due, or Not Applicable — leave blank if unknown" },
  { header: "Last Calibration Date", required: false },
  { header: "Next Calibration Due", required: false },
];

export const DEAD_STOCK_COLUMNS: ColumnDef[] = [
  { header: "Name of Article", required: true },
  { header: "Date of Purchase", required: false },
  { header: "Quantity", required: false, hint: "a number greater than 0 — defaults to 1 if left blank" },
  { header: "Purchase Price (₹)", required: false },
  { header: "Depreciation %", required: false, hint: "a number from 0 to 100 — defaults to 25 if left blank" },
  { header: "Resolution Date", required: false },
  { header: "Rejected Qty", required: false, hint: "a number ≥ 0 — defaults to 0 if left blank" },
  { header: "Rejected Value (₹)", required: false, hint: "a number ≥ 0 — defaults to 0 if left blank" },
  { header: "Balance Qty", required: false },
  { header: "Balance Value (₹)", required: false },
  { header: "Remark", required: false },
];

export const MODULE_COLUMNS: Record<BulkUploadModuleKey, ColumnDef[]> = {
  items: ITEM_COLUMNS,
  vendors: VENDOR_COLUMNS,
  "item-types": ITEM_TYPE_COLUMNS,
  mfr: MFR_COLUMNS,
  purchase: PURCHASE_COLUMNS,
  equipment: EQUIPMENT_COLUMNS,
  "dead-stock": DEAD_STOCK_COLUMNS,
};

// Keeps one request bounded — this is an admin bulk-entry tool, not a
// mass-migration pipeline. Item/Vendor/Item Type/Equipment/Dead Stock
// each need one get_next_*_code() RPC round trip per row before the
// final insert; MFR and Purchase need a handful of statements per group
// (MFR / purchase order) inside their one bulk RPC call. 500 data rows
// is generous for hand-curated master-data entry while keeping
// worst-case request time reasonable — for Purchase specifically, that's
// 500 purchase LINES per file (not 500 purchase orders), same as MFR
// counting recipe lines, not MFR definitions.
export const MAX_UPLOAD_ROWS = 500;

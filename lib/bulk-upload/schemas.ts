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
// ledger or workflow side effects. Purchase is deliberately NOT here; it's
// a materially more complex multi-table shape (PO header + GST/pricing
// lines that push real inventory_ledger rows) and was left for a later,
// separately-scoped pass rather than folded in here.

export const BULK_UPLOAD_MODULES = ["items", "vendors", "item-types", "mfr"] as const;
export type BulkUploadModuleKey = (typeof BULK_UPLOAD_MODULES)[number];

export type ColumnDef = { header: string; required: boolean; hint?: string };

export const BULK_UPLOAD_MODULE_META: Record<
  BulkUploadModuleKey,
  { title: string; sheetName: string; fileBaseName: string; module: "items" | "vendors" | "item_types" | "mfr" }
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

export const MODULE_COLUMNS: Record<BulkUploadModuleKey, ColumnDef[]> = {
  items: ITEM_COLUMNS,
  vendors: VENDOR_COLUMNS,
  "item-types": ITEM_TYPE_COLUMNS,
  mfr: MFR_COLUMNS,
};

// Keeps one request bounded — this is an admin bulk-entry tool, not a
// mass-migration pipeline. Item/Vendor/Item Type each need one
// get_next_*_code() RPC round trip per row before the final insert; MFR
// needs a handful of statements per MFR group inside the one bulk RPC
// call. 500 data rows is generous for hand-curated master-data entry
// while keeping worst-case request time reasonable.
export const MAX_UPLOAD_ROWS = 500;

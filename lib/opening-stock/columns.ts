import type { ColumnDef } from "@/lib/bulk-upload/schemas";

// Opening stock sheets (Ravi, 3 Oct 2026, FB-0054 / B4). One row = one batch
// in stock on the day the old records stop. Header text is the single source
// of truth for both the downloadable template and the upload check.

export type OpeningKind = "raw" | "packaging";

export const OPENING_KINDS: { key: OpeningKind; title: string; sheetName: string; fileBaseName: string }[] = [
  { key: "raw", title: "Raw Material", sheetName: "Raw Material Opening", fileBaseName: "opening-stock-raw-material" },
  { key: "packaging", title: "Packaging", sheetName: "Packaging Opening", fileBaseName: "opening-stock-packaging" },
];

export const MAX_OPENING_ROWS = 500;

export const RM_COLUMNS: ColumnDef[] = [
  { header: "Item Code", required: true, hint: "The Item Master code of the raw material, e.g. RM-001" },
  { header: "Batch No", required: true, hint: "Exactly as printed on the container. Not a number made by this app (RM-001-0001/26 style)" },
  { header: "Quantity in stock", required: true, numeric: true, hint: "In the item's own unit, as counted. Above 0" },
  { header: "Receipt date", required: true, hint: "When the batch was received. Older stock is used first. Not in the future" },
  { header: "Manufacturer expiry date", required: false, hint: "Required for Approved and Pending QC batches" },
  { header: "QC status", required: true, hint: "Approved, Pending QC or Rejected" },
  { header: "Old AR No", required: false, hint: "The Analytical Report number from the old records, as written there. Required for Approved and Rejected" },
  { header: "QC approval date", required: false, hint: "Required for Approved and Rejected. Not in the future" },
  { header: "Retest date", required: false, hint: "Required for Approved. Must be after the QC approval date" },
  { header: "Retests already done", required: false, numeric: true, hint: "0 to 3. Counts toward the 3-retest limit. Blank means 0" },
  { header: "Vendor Code", required: false, hint: "Optional. A code from Vendor Master" },
  { header: "Unit price", required: false, numeric: true, hint: "Optional" },
  { header: "GST %", required: false, numeric: true, percent: true, hint: "Optional. 18 means 18%" },
];

export const PKG_COLUMNS: ColumnDef[] = [
  { header: "Item Code", required: true, hint: "The Item Master code of the packaging item, e.g. PKG-001" },
  { header: "Quantity", required: true, numeric: true, hint: "In the item's own unit, as counted. Above 0" },
  { header: "Receipt date", required: true, hint: "When the lot was received. Older stock is used first. Not in the future" },
  { header: "Lot No", required: false, hint: "Optional. Left blank, the app gives the lot a number" },
  { header: "Vendor Code", required: false, hint: "Optional. A code from Vendor Master" },
  { header: "Unit price", required: false, numeric: true, hint: "Optional" },
  { header: "GST %", required: false, numeric: true, percent: true, hint: "Optional. 18 means 18%" },
];

export const OPENING_COLUMNS: Record<OpeningKind, ColumnDef[]> = { raw: RM_COLUMNS, packaging: PKG_COLUMNS };

export const OPENING_EXAMPLES: Record<OpeningKind, string[][]> = {
  raw: [
    ["RM-001", "AB-2291", "250", "12-03-2026", "11-03-2029", "Approved", "AR/24-25/118", "20-03-2026", "16-09-2026", "0", "V-0001", "410", "18"],
    ["RM-001", "AB-2305", "40", "02-05-2026", "30-04-2029", "Pending QC", "", "", "", "", "", "", ""],
  ],
  packaging: [["PKG-001", "5000", "10-04-2026", "L-77", "V-0001", "3.5", "18"]],
};

export const QC_STATUS_WORDS: Record<string, "approved" | "pending" | "rejected"> = {
  approved: "approved",
  "pending qc": "pending",
  pending: "pending",
  rejected: "rejected",
};

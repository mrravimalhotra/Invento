import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import {
  addHeaderRow, addExampleRows, addReferenceColumn, applyDropdownColumn, DATE_NOTE, EXAMPLE_ROW_NOTE,
} from "@/lib/bulk-upload/templates";
import { MAX_OPENING_ROWS, OPENING_COLUMNS, OPENING_EXAMPLES, OPENING_KINDS, type OpeningKind } from "./columns";

const INTRO: Record<OpeningKind, string[]> = {
  raw: [
    "Opening stock: Raw Material — one row per batch in stock on the day the old records stop. Fill it from the physical stock count sheet.",
    "QC status is Approved, Pending QC or Rejected. Approved and Rejected batches need the old Analytical Report (AR) number, written exactly as in the old records, and the QC approval date. Approved batches also need the retest date and the manufacturer expiry date. Pending QC batches only need the expiry date; they join the normal QC queue.",
    "Retests already done (0 to 3) counts toward the limit of 3 retests, so a batch retested twice before can be retested once more.",
    "Batch No must be the number on the container. A number that looks like one this app makes (for example RM-001-0001/26) is refused, and so is an AR number that looks like ARRM-0001/26 or ARFP-0001/26.",
    "Vendor Code and Unit price are optional. Rows with no vendor are recorded against a system vendor called \"Opening stock (vendor not recorded)\".",
  ],
  packaging: [
    "Opening stock: Packaging — one row per lot in stock on the day the old records stop. Fill it from the physical stock count sheet.",
    "Lot No is optional; left blank, the app gives the lot a number. Packaging needs no QC.",
    "Vendor Code and Unit price are optional. Rows with no vendor are recorded against a system vendor called \"Opening stock (vendor not recorded)\".",
  ],
};

export async function buildOpeningWorkbook(kind: OpeningKind, supabase: SupabaseClient): Promise<ExcelJS.Workbook> {
  const meta = OPENING_KINDS.find((k) => k.key === kind)!;
  const columns = OPENING_COLUMNS[kind];
  const category = kind === "raw" ? "raw" : "packaging";

  const [{ data: items }, { data: vendors }] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("items").select("item_code").eq("category", category).eq("active", true)
        .order("item_code", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) =>
      supabase.from("vendors").select("vendor_code").eq("active", true)
        .order("vendor_code", { ascending: true }).order("id", { ascending: true }).range(from, to)),
  ]);
  const itemCodes = (items ?? []).map((i) => i.item_code);
  const vendorCodes = (vendors ?? []).map((v) => v.vendor_code).filter((c) => c !== "V-OPENING");

  const workbook = new ExcelJS.Workbook();
  const info = workbook.addWorksheet("Instructions");
  info.columns = [{ width: 110 }];
  [
    `${meta.title} opening stock — template`,
    "",
    "Fill the sheet named \"" + meta.sheetName + "\" (not this Instructions sheet), one row per batch. Columns marked * are required. Do not rename, reorder or delete the header row.",
    EXAMPLE_ROW_NOTE,
    ...INTRO[kind],
    DATE_NOTE,
    "A file is loaded only if every row passes the check. If anything is wrong, nothing is loaded and each problem is listed with its Excel row number.",
    `Up to ${MAX_OPENING_ROWS} rows per file.`,
    "",
    "Column notes:",
    ...columns.map((c) => `• ${c.header}${c.required ? " (required)" : ""}${c.hint ? " — " + c.hint : ""}`),
  ].forEach((line, i) => {
    const row = info.addRow([line]);
    if (i === 0 || line === "Column notes:") row.font = { bold: true };
  });

  const sheet = workbook.addWorksheet(meta.sheetName);
  addHeaderRow(sheet, columns);
  addExampleRows(sheet, columns, OPENING_EXAMPLES[kind]);

  const ref = workbook.addWorksheet("Reference");
  const itemLast = addReferenceColumn(ref, 1, `Active ${meta.title} item codes`, itemCodes);
  const vendorLast = addReferenceColumn(ref, 2, "Active vendor codes", vendorCodes);
  const end = 1 + MAX_OPENING_ROWS;
  const col = (h: string) => columns.findIndex((c) => c.header === h) + 1;
  applyDropdownColumn(sheet, col("Item Code"), 2, end, [`Reference!$A$2:$A$${itemLast}`]);
  applyDropdownColumn(sheet, col("Vendor Code"), 2, end, [`Reference!$B$2:$B$${vendorLast}`]);
  if (kind === "raw") applyDropdownColumn(sheet, col("QC status"), 2, end, ['"Approved,Pending QC,Rejected"']);
  return workbook;
}

import ExcelJS from "exceljs";
import type { ColumnDef } from "./schemas";

export type ParsedSheet = {
  headers: string[];
  // Each row is already trimmed to a string per cell, same length as
  // headers.length, in file order. Fully-blank rows (every cell empty)
  // are dropped — a stray blank row left in the template shouldn't count
  // as a row someone meant to submit.
  rows: string[][];
};

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    // Rich text / formula-result / hyperlink cells all carry a `.text` or
    // `.result` — fall back to a readable string rather than "[object
    // Object]" if a cell ever comes through as one of these.
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result !== undefined && value.result !== null) {
      return String(value.result).trim();
    }
    if (value instanceof Date) return value.toISOString();
    return "";
  }
  return String(value).trim();
}

// Reads the data sheet of an uploaded .xlsx: row 1 is headers, every row
// after is data. Throws a plain Error with a message safe to show the user
// directly (not a raw parser exception) if the file isn't a readable
// workbook at all, or has no header row.
//
// `expectedSheetName` should be that module's
// BULK_UPLOAD_MODULE_META[module].sheetName. Bug found live 14 Sept 2026
// (Ravi: Item Type Master upload failing "Missing required column:
// Description" against a freshly downloaded, unmodified template — not
// user error). Root cause: this function used to just read
// `workbook.worksheets[0]` — but templates.ts's addInstructionsSheet()
// always creates the "Instructions" sheet BEFORE the actual data sheet in
// every one of the 7 module templates, so worksheets[0] was ALWAYS the
// Instructions sheet's one prose column, never the real data. The
// Twenty-fifth pass's header-suffix-stripping fix (normalizeHeader()
// below) was real and necessary but insufficient on its own — even with
// headers matched correctly, this function was handing findColumnIndex()
// an entirely different sheet's headers, so every required-column check
// failed identically regardless of that fix. This is a distinct,
// more fundamental bug than the one that pass fixed, present since the
// very first Bulk Data Upload build (Twenty-first pass), never caught
// because no prior verification pass actually round-tripped the FULL
// multi-sheet generated template through this exact function — only
// findColumnIndex() in isolation. Fixed: look the sheet up by its known
// name first (case-insensitive, trimmed — matches how templates.ts names
// it); if that lookup ever fails (e.g. a re-saved file with a renamed
// tab), fall back to the first sheet that isn't named "Instructions" or
// "Reference", rather than assuming position 0 again.
export async function readFirstSheet(file: File, expectedSheetName?: string): Promise<ParsedSheet> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's bundled type declarations predate @types/node 20's now-
    // generic Buffer<TArrayBuffer> — TS treats Buffer.from()'s inferred
    // Buffer<ArrayBufferLike> as structurally incompatible with exceljs's
    // plain `Buffer` parameter type (missing the newer resizable-
    // ArrayBuffer members), even though it's a real Buffer at runtime.
    // This is an ecosystem-wide @types/node 20.x issue, not specific to
    // this file — `as any` is the standard workaround (e.g. widely
    // reported against other libraries typed against pre-generic Buffer).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);
  } catch {
    throw new Error("Couldn't read that file as an Excel workbook (.xlsx). Please use the downloaded template.");
  }

  const NON_DATA_SHEET_NAMES = new Set(["instructions", "reference"]);
  const byExpectedName = expectedSheetName
    ? workbook.worksheets.find((s) => s.name.trim().toLowerCase() === expectedSheetName.trim().toLowerCase())
    : undefined;
  const sheet =
    byExpectedName ?? workbook.worksheets.find((s) => !NON_DATA_SHEET_NAMES.has(s.name.trim().toLowerCase()));
  if (!sheet || sheet.rowCount === 0) {
    throw new Error("That file has no data — the data sheet is empty or missing.");
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    headers.push(cellToString(cell.value));
  });
  if (headers.length === 0) {
    throw new Error("Couldn't find a header row in that file. Please use the downloaded template.");
  }

  const rows: string[][] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values: string[] = [];
    for (let c = 1; c <= headers.length; c++) {
      values.push(cellToString(row.getCell(c).value));
    }
    if (values.some((v) => v !== "")) rows.push(values);
  }

  return { headers, rows };
}

// Case-insensitive, trimmed header match — a user retyping "name" or
// " Name " instead of "Name" shouldn't break the upload. Also strips a
// trailing "*" (the required-field marker templates.ts's addHeaderRow
// writes directly into the header cell, e.g. "Description *") before
// comparing — without this, findColumnIndex compared the literal cell
// text ("description *") against the plain column name ("description")
// and never matched, so every required column in every downloaded
// template was reported "missing" even when the template was used
// correctly. Found live 13 Sept 2026 (Ravi: Item Type Master and Vendor
// Master uploads both failing with "Missing required column" against
// their own downloaded templates) — the bug is in this shared function,
// so it affected every module's required columns identically, not just
// the two Ravi happened to try first.
function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .replace(/\s*\*+\s*$/, "")
    .trim()
    .toLowerCase();
}

export function findColumnIndex(headers: string[], column: ColumnDef): number {
  const target = normalizeHeader(column.header);
  return headers.findIndex((h) => normalizeHeader(h) === target);
}

export function requireColumns(headers: string[], columns: ColumnDef[]): string | null {
  for (const col of columns) {
    if (col.required && findColumnIndex(headers, col) === -1) {
      return `Missing required column "${col.header}" — did you use the downloaded template?`;
    }
  }
  return null;
}

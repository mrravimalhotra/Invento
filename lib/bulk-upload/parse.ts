import ExcelJS from "exceljs";
import { MAX_UPLOAD_ROWS, type ColumnDef } from "./schemas";
import { MAX_UPLOAD_FILE_BYTES, uploadFileTooBigMessage } from "./limits";

export type ParsedSheet = {
  headers: string[];
  // Each row is already trimmed to a string per cell, same length as
  // headers.length, in file order. Fully-blank rows (every cell empty)
  // are dropped — a stray blank row left in the template shouldn't count
  // as a row someone meant to submit.
  rows: string[][];
  // The Excel row number each kept row came from (same length as `rows`).
  // ACC-23: error messages used to number rows as position + 2, which pointed
  // at the wrong Excel row as soon as a blank row (or an untouched example
  // row) had been dropped above it.
  rowNumbers: number[];
};

// Reads a cell the way the person sees it, as a plain string.
//
// ACC-23 (29 Sept 2026) — what this used to get wrong:
//   - rich-text cells (partly bold/coloured text) came through as blank;
//   - a percentage-formatted cell holding 25% arrived as 0.25;
//   - dates were turned into full ISO timestamps.
function valueToString(value: ExcelJS.CellValue, numFmt?: string): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // Excel dates are stored without a time zone; exceljs hands them back as
    // UTC, so read the UTC parts. A pure date becomes yyyy-mm-dd.
    if (Number.isNaN(value.getTime())) return "";
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof value === "number") {
    // A cell formatted as a percentage stores 0.25 and shows "25%": read
    // what is shown. toPrecision(12) removes float noise (0.18 * 100).
    if (numFmt && numFmt.includes("%")) return String(Number((value * 100).toPrecision(12)));
    return String(value);
  }
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("").trim();
    }
    // Formula cells: the last calculated result is what Excel shows.
    if ("result" in value && value.result !== undefined && value.result !== null) {
      return valueToString(value.result as ExcelJS.CellValue, numFmt);
    }
    // Hyperlink cells carry their visible text.
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("error" in value && typeof value.error === "string") return value.error;
    return "";
  }
  return String(value).trim();
}

function cellToString(cell: ExcelJS.Cell): string {
  return valueToString(cell.value, cell.numFmt);
}

// An example row that ships in a downloaded template. A data row that
// matches it in every column is the untouched example and is skipped.
export type ExampleRowSpec = { columns: ColumnDef[]; rows: string[][] };

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
// `allowFallback` (default true, 20 Sept 2026 — added for MFR's Recipe /
// Manufacturing Procedure split, lib/actions/bulk-upload.ts's
// bulkUploadMfr()): every module used to have exactly one data sheet, so
// falling back to "the first sheet that isn't Instructions/Reference"
// when the expected name isn't found was always safe — there was nothing
// else it could accidentally match. MFR now has TWO data sheets in one
// workbook; if the Manufacturing Procedure sheet were missing or renamed,
// that same fallback would silently hand back the Recipe sheet a second
// time under the "Procedure" label instead of a clear error, and its
// recipe-shaped rows would then fail Procedure-column validation in
// confusing, misleading ways. Callers that read a SECOND named sheet from
// a workbook that already has a known first one should pass
// `{ allowFallback: false }` so a missing/renamed sheet fails fast and
// explicitly instead.
export async function readFirstSheet(
  file: File,
  expectedSheetName?: string,
  options?: { allowFallback?: boolean; skipExamples?: ExampleRowSpec }
): Promise<ParsedSheet> {
  const allowFallback = options?.allowFallback ?? true;
  if (file.size > MAX_UPLOAD_FILE_BYTES) throw new Error(uploadFileTooBigMessage(file.size));
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
  if (expectedSheetName && !byExpectedName && !allowFallback) {
    throw new Error(`Couldn't find the "${expectedSheetName}" sheet in that file — did you use the downloaded template?`);
  }
  const sheet =
    byExpectedName ?? workbook.worksheets.find((s) => !NON_DATA_SHEET_NAMES.has(s.name.trim().toLowerCase()));
  if (!sheet || sheet.rowCount === 0) {
    throw new Error("That file has no data — the data sheet is empty or missing.");
  }

  // ACC-23: headers are read by column position, keeping blank header cells
  // as "", so a blank header no longer shifts every later column left.
  const headerRow = sheet.getRow(1);
  let lastHeaderCol = 0;
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (cellToString(cell) !== "" && colNumber > lastHeaderCol) lastHeaderCol = colNumber;
  });
  const headers: string[] = [];
  for (let c = 1; c <= lastHeaderCol; c++) {
    headers.push(cellToString(headerRow.getCell(c)));
  }
  if (headers.length === 0) {
    throw new Error("Couldn't find a header row in that file. Please use the downloaded template.");
  }

  // Column position of each example-row column, when this module has examples.
  const example = options?.skipExamples;
  const exampleIdx = example ? example.columns.map((col) => findColumnIndex(headers, col)) : [];
  const isExampleRow = (values: string[]): boolean => {
    if (!example || exampleIdx.some((i) => i === -1)) return false;
    return example.rows.some((ex) => ex.every((exVal, k) => (values[exampleIdx[k]] ?? "").trim() === exVal.trim()));
  };

  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  // SCAN-P2-06: walk only the rows that really exist. The old loop asked for
  // every row number from 2 to the sheet's last used row, so one stray
  // formatted cell near row 1,000,000 made a 6 KB file take 6 seconds and
  // 1.9 GB of memory. The cap (limit + 20 filled rows) stops a file that is
  // far over the limit before it is read in full; the callers still report
  // the exact count for files just over the limit.
  const rowCap = MAX_UPLOAD_ROWS + 20;
  sheet.eachRow({ includeEmpty: false }, (row, r) => {
    if (r < 2) return;
    const values: string[] = [];
    for (let c = 1; c <= headers.length; c++) {
      values.push(cellToString(row.getCell(c)));
    }
    if (!values.some((v) => v !== "")) return;
    if (isExampleRow(values)) return;
    if (rows.length >= rowCap) {
      throw new Error(
        `That sheet has more than ${rowCap} filled rows — the limit per upload is ${MAX_UPLOAD_ROWS}. Split it into several files.`
      );
    }
    rows.push(values);
    rowNumbers.push(r);
  });

  return { headers, rows, rowNumbers };
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

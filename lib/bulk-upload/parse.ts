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

// Reads the first worksheet of an uploaded .xlsx: row 1 is headers, every
// row after is data. Throws a plain Error with a message safe to show the
// user directly (not a raw parser exception) if the file isn't a readable
// workbook at all, or has no header row.
export async function readFirstSheet(file: File): Promise<ParsedSheet> {
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

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) {
    throw new Error("That file has no data — the first sheet is empty.");
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
// " Name " instead of "Name" shouldn't break the upload.
export function findColumnIndex(headers: string[], column: ColumnDef): number {
  const target = column.header.trim().toLowerCase();
  return headers.findIndex((h) => h.trim().toLowerCase() === target);
}

export function requireColumns(headers: string[], columns: ColumnDef[]): string | null {
  for (const col of columns) {
    if (col.required && findColumnIndex(headers, col) === -1) {
      return `Missing required column "${col.header}" — did you use the downloaded template?`;
    }
  }
  return null;
}

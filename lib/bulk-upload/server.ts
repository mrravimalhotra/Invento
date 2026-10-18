// Shared helpers for the bulk upload Server Actions in lib/actions/bulk-upload/
// (one file per module since 18 Oct 2026). Overview of the design:
//
// Bulk data upload — Server Actions.
//
// Ravi (13 Sept 2026): "create a link in admin panel to upload data...
// as bulk upload" for Item Master, Vendor, Item Type, MFR (Purchase
// deliberately out of scope this pass — see lib/bulk-upload/schemas.ts).
// Scoped via AskUserQuestion: codes are ALWAYS server-generated (never
// read from the file), validation is all-or-nothing per file (any row
// error means nothing is imported), and each module's upload is gated by
// that same module's existing canWrite() role set — not admin-only —
// matching who can already create one record at a time by hand.
//
// Item Master / Vendor Master / Item Type Master need no new RPC: once
// every row is validated (and, for Item/Vendor, every code generated) a
// single multi-row supabase.from(table).insert([...]) is already one
// atomic Postgres statement — "all rows or none" for free. MFR is
// different (a multi-table, multi-step, multi-group operation) and goes
// through the new bulk_create_mfr_definitions() RPC (0037_bulk_upload_
// mfr.sql) for true all-or-nothing atomicity across the whole file — see
// that migration's header comment for the full reasoning.
//
// Purchase, Instrument/Equipment Master, and Dead Stock Register added
// 13 Sept 2026 (Ravi: "can we have purchase, instrument and dead stock
// entries done as excel as part of bulk upload utility we created").
// Equipment and Dead Stock are flat, single-table master data — same
// "validate every row, generate every code, one multi-row insert" shape
// as Vendor Master, no new RPC needed. Purchase again needs its own RPC
// (bulk_create_purchase_orders(), 0038_bulk_upload_purchase.sql) for the
// same reason MFR does: one row = one purchase line, grouped into a
// purchase order by repeating Vendor Name + Invoice Number (+ Invoice
// Date), and every bulk-uploaded purchase order lands as a Draft — see
// that migration's header comment for the "why Draft needs no special
// code" reasoning.
//
// Vendor Name / Item Name, not Vendor Code / Item Code (20 Sept 2026,
// Ravi). Matching is by-name, case-insensitive, and — since neither
// vendors.name nor items.name is DB-uniquely-constrained (only checked
// app-side, going forward, on new writes — see the Twenty-fifth/
// Twenty-sixth known-issues.md passes) — a name that matches more than
// one active vendor, or more than one active item of the row's own
// Purchase Type category, is rejected with a row error asking for a more
// specific name rather than silently guessing which one was meant.

import { createClient } from "@/lib/supabase/server";
import { UNITS, type Unit } from "@/lib/constants/units";
import { readFirstSheet, findColumnIndex } from "@/lib/bulk-upload/parse";
import { EXAMPLE_ROWS } from "@/lib/bulk-upload/examples";
import { parseUploadDate, DATE_FORMAT_HINT } from "@/lib/bulk-upload/dates";
import {
  MAX_UPLOAD_ROWS,
  BULK_UPLOAD_MODULE_META,
  type BulkUploadModuleKey,
  type ColumnDef,
} from "@/lib/bulk-upload/schemas";
import { friendlyDbError } from "@/lib/db-errors";

// One round trip for all the codes a bulk import needs (0087; PERF-04),
// instead of one RPC per row. Returns the codes in order, or an error text
// in the same "Could not generate ..." wording the per-row loop used.
export async function nextCodes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fn: "get_next_item_codes" | "get_next_vendor_codes" | "get_next_equipment_codes" | "get_next_dead_stock_codes",
  args: Record<string, unknown>,
  count: number,
  label: string
): Promise<{ codes: string[] } | { error: string }> {
  if (count === 0) return { codes: [] };
  const { data, error } = await supabase.rpc(fn, { ...args, p_count: count });
  const codes = (data ?? []) as string[];
  if (error || codes.length !== count) {
    return { error: `Could not generate ${label} codes: ${friendlyDbError(error, "unknown error")}` };
  }
  return { codes };
}

export type BulkUploadState =
  | { error?: string; rowErrors?: string[]; success?: string }
  | undefined;

export function cell(row: string[], headers: string[], col: ColumnDef): string {
  const idx = findColumnIndex(headers, col);
  if (idx === -1) return "";
  const text = (row[idx] ?? "").trim();
  // ACC-23: a percentage typed as text ("18%", "18 %") is read as 18. A
  // percent-formatted Excel cell is already turned into 18 by the parser.
  return col.percent ? text.replace(/\s*%$/, "") : text;
}

export function matchUnit(raw: string): Unit | null {
  const target = raw.trim().toLowerCase();
  return UNITS.find((u) => u === target) ?? null;
}

export async function loadSheetOrError(formData: FormData, columns: ColumnDef[], module: BulkUploadModuleKey) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an Excel file (.xlsx) to upload." } as const;
  }

  let sheet;
  try {
    // ACC-23: an untouched example row from the template is not a record.
    sheet = await readFirstSheet(file, BULK_UPLOAD_MODULE_META[module].sheetName, {
      skipExamples: module === "mfr" ? undefined : { columns, rows: EXAMPLE_ROWS[module] },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that file." } as const;
  }

  const missing = columns.filter((c) => c.required && findColumnIndex(sheet.headers, c) === -1);
  if (missing.length > 0) {
    return {
      error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing
        .map((c) => `"${c.header}"`)
        .join(", ")} — did you use the downloaded template?`,
    } as const;
  }

  if (sheet.rows.length === 0) {
    return { error: "That file has no data rows — nothing to import." } as const;
  }
  if (sheet.rows.length > MAX_UPLOAD_ROWS) {
    return {
      error: `That file has ${sheet.rows.length} data rows — the limit per upload is ${MAX_UPLOAD_ROWS}. Split it into smaller files and upload separately.`,
    } as const;
  }

  return { sheet } as const;
}

// Error messages use the Excel row number each data row really came from
// (sheet.rowNumbers) — not its position in the list, which drifts as soon as
// a blank or untouched example row has been skipped above it (ACC-23).

// Shared by Equipment and Dead Stock below — returns the parsed date (as
// YYYY-MM-DD) for a non-empty cell, null for a blank one, or undefined as
// a sentinel meaning "already pushed a row error, stop parsing this row."
export function parseOptionalDate(raw: string, label: string, r: number, rowErrors: string[]): string | null | undefined {
  if (!raw) return null;
  // ACC-23: explicit formats only (see lib/bulk-upload/dates.ts) — not
  // `new Date(text)`, which read "05-09-2026" as 9 May.
  const iso = parseUploadDate(raw);
  if (!iso) {
    rowErrors.push(`Row ${r}: ${label} "${raw}" isn't a valid date — ${DATE_FORMAT_HINT}.`);
    return undefined;
  }
  return iso;
}

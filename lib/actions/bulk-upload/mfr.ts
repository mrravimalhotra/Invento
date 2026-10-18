"use server";

import { normName } from "@/lib/name-rules";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { UNITS, type Unit } from "@/lib/constants/units";
import { revalidatePath } from "next/cache";
import { readFirstSheet, findColumnIndex } from "@/lib/bulk-upload/parse";
import { EXAMPLE_ROWS } from "@/lib/bulk-upload/examples";
import {
  MFR_RECIPE_COLUMNS,
  MFR_PROCEDURE_COLUMNS,
  MFR_PROCEDURE_SHEET_NAME,
  MAX_UPLOAD_ROWS,
  BULK_UPLOAD_MODULE_META,
} from "@/lib/bulk-upload/schemas";
import { friendlyDbError } from "@/lib/db-errors";
import { cell, matchUnit, type BulkUploadState } from "@/lib/bulk-upload/server";

// ------------------------------------------------------------------
// MFR
// ------------------------------------------------------------------
type MfrLinePayload = { item_id: string; quantity: number; unit: Unit };
type MfrProcedureStepPayload = { stage: string; operation: string };
type MfrDefPayload = {
  name: string;
  batch_size_qty: number;
  batch_size_unit: Unit;
  item_type_id: string | null;
  lines: MfrLinePayload[];
  // Manufacturing Process (0048_mfr_procedure.sql) — all optional, added
  // 20 Sept 2026 (Ravi: "Also include template to upload 'Manufacturing
  // Process' along with recipe"). Left null/empty exactly like a
  // manually-created MFR that's never had its procedure filled in when
  // the file carries no procedure data for that MFR — see
  // bulk_create_mfr_definitions() in 0054_bulk_upload_mfr_procedure.sql.
  procedure_intro: string | null;
  theoretical_yield_pct: number | null;
  permissible_yield_pct: number | null;
  procedure_steps: MfrProcedureStepPayload[];
};

export async function bulkUploadMfr(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "mfr")) return { error: "Not authorized." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an Excel file (.xlsx) to upload." };
  }

  // Two sheets, not one (20 Sept 2026, Ravi: "divide this into two sheets
  // one for recipe and the other one for procedure. Only required columns
  // should be part of each of these") — see MFR_RECIPE_COLUMNS /
  // MFR_PROCEDURE_COLUMNS in lib/bulk-upload/schemas.ts for the full
  // reasoning. Recipe is always required (every MFR needs at least one
  // recipe line); Manufacturing Procedure is fully optional (an MFR can
  // have zero procedure steps) — so the two sheets are loaded and
  // validated separately rather than through the shared loadSheetOrError()
  // helper other single-sheet modules use, which assumes exactly one data
  // sheet and treats zero data rows as always an error.
  let recipeSheet: { headers: string[]; rows: string[][]; rowNumbers: number[] };
  try {
    recipeSheet = await readFirstSheet(file, BULK_UPLOAD_MODULE_META.mfr.sheetName, {
      skipExamples: { columns: MFR_RECIPE_COLUMNS, rows: EXAMPLE_ROWS["mfr-recipe"] },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that file." };
  }
  const missingRecipeCols = MFR_RECIPE_COLUMNS.filter((c) => c.required && findColumnIndex(recipeSheet.headers, c) === -1);
  if (missingRecipeCols.length > 0) {
    return {
      error: `Missing required column${missingRecipeCols.length > 1 ? "s" : ""} on the Recipe sheet: ${missingRecipeCols
        .map((c) => `"${c.header}"`)
        .join(", ")} — did you use the downloaded template?`,
    };
  }
  if (recipeSheet.rows.length === 0) {
    return { error: "The Recipe sheet has no data rows — nothing to import." };
  }
  if (recipeSheet.rows.length > MAX_UPLOAD_ROWS) {
    return {
      error: `The Recipe sheet has ${recipeSheet.rows.length} data rows — the limit per upload is ${MAX_UPLOAD_ROWS}. Split it into smaller files and upload separately.`,
    };
  }

  // `allowFallback: false` — a missing/renamed Manufacturing Procedure
  // sheet must fail clearly here, not silently re-read the Recipe sheet a
  // second time under the "Procedure" label (see readFirstSheet's own
  // comment in lib/bulk-upload/parse.ts).
  let procedureSheet: { headers: string[]; rows: string[][]; rowNumbers: number[] };
  try {
    procedureSheet = await readFirstSheet(file, MFR_PROCEDURE_SHEET_NAME, {
      allowFallback: false,
      skipExamples: { columns: MFR_PROCEDURE_COLUMNS, rows: EXAMPLE_ROWS["mfr-procedure"] },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read the Manufacturing Procedure sheet." };
  }
  const missingProcedureCols = MFR_PROCEDURE_COLUMNS.filter(
    (c) => c.required && findColumnIndex(procedureSheet.headers, c) === -1
  );
  if (missingProcedureCols.length > 0) {
    return {
      error: `Missing required column${missingProcedureCols.length > 1 ? "s" : ""} on the Manufacturing Procedure sheet: ${missingProcedureCols
        .map((c) => `"${c.header}"`)
        .join(", ")} — did you use the downloaded template?`,
    };
  }
  // Zero data rows on this sheet is valid — it just means no MFR in this
  // file has any Manufacturing Procedure steps, same as leaving that
  // section blank on the MFR screen itself.
  if (procedureSheet.rows.length > MAX_UPLOAD_ROWS) {
    return {
      error: `The Manufacturing Procedure sheet has ${procedureSheet.rows.length} data rows — the limit per upload is ${MAX_UPLOAD_ROWS}. Split it into smaller files and upload separately.`,
    };
  }

  const supabase = await createClient();
  const [{ data: itemTypes }, { data: rawItems }, { data: existingMfrRows }] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("item_types").select("id, description").eq("active", true).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("items").select("id, item_code, name").eq("category", "raw").eq("active", true).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("mfr_definitions").select("name").order("id", { ascending: true }).range(from, to)),
  ]);
  const itemTypeByName = new Map((itemTypes ?? []).map((t) => [t.description.trim().toLowerCase(), t.id]));
  // Keyed by name (not code), 20 Sept 2026 — Ravi: "Replace Line Item Code
  // by Line Item Name," same "similar changes" pattern as Purchase (see
  // that function's own comment above). Several active raw items can
  // share a name, so each key maps to an array; a row is only usable once
  // it resolves to exactly one match.
  const rawItemByName = new Map<string, { id: string; item_code: string }[]>();
  (rawItems ?? []).forEach((it) => {
    const key = it.name.trim().toLowerCase();
    const arr = rawItemByName.get(key) ?? [];
    arr.push({ id: it.id, item_code: it.item_code });
    rawItemByName.set(key, arr);
  });
  // mfr_definitions.name has no DB-level unique constraint — same reasoning
  // as Item/Vendor's name dedup. Checked only when a NEW group is opened
  // below (i.e. against the DB, not within-file — repeating the same MFR
  // Name across rows in the Recipe sheet is how its multiple recipe lines
  // are expressed, and is already handled by the grouping itself). Ravi
  // (13 Sept 2026, via AskUserQuestion): "add duplicate blocking on ... MFR
  // Name ... for both bulk upload and the regular one-at-a-time forms."
  const existingMfrNames = new Set((existingMfrRows ?? []).map((m) => normName(m.name)));

  const rowErrors: string[] = [];
  // Groups keyed by exact (trimmed) MFR Name text — repeating the same
  // name across rows is how one MFR's multiple recipe lines (Recipe
  // sheet) and/or Manufacturing Process steps (Manufacturing Procedure
  // sheet) are expressed. Every group is created while processing the
  // Recipe sheet (below) — the Procedure sheet only ever looks an
  // existing group up by name, never creates one, which is what
  // structurally guarantees every MFR has at least one recipe line
  // without a separate "no recipe lines" check afterward. firstRow is the
  // first Recipe-sheet row for this MFR (for Batch Size/Item Type
  // mismatch messages); firstProcedureRow is the first Procedure-sheet
  // row that set Procedure Intro/Theoretical/Permissible Yield for this
  // MFR (for THEIR mismatch messages) — kept separate since they're now
  // two different sheets, so a Recipe-sheet row number would be a
  // confusing thing to point at for a Procedure-sheet-only conflict.
  const groups = new Map<string, { firstRow: number; firstProcedureRow: number | null; def: MfrDefPayload }>();

  // ---- Recipe sheet: one row = one recipe line, always required ----
  recipeSheet.rows.forEach((row, i) => {
    const r = recipeSheet.rowNumbers[i];
    const name = cell(row, recipeSheet.headers, MFR_RECIPE_COLUMNS[0]);
    const batchQtyRaw = cell(row, recipeSheet.headers, MFR_RECIPE_COLUMNS[1]);
    const batchUnitRaw = cell(row, recipeSheet.headers, MFR_RECIPE_COLUMNS[2]);
    const itemTypeRaw = cell(row, recipeSheet.headers, MFR_RECIPE_COLUMNS[3]);
    const lineNameRaw = cell(row, recipeSheet.headers, MFR_RECIPE_COLUMNS[4]);
    const lineQtyRaw = cell(row, recipeSheet.headers, MFR_RECIPE_COLUMNS[5]);
    const lineUnitRaw = cell(row, recipeSheet.headers, MFR_RECIPE_COLUMNS[6]);

    if (!name) {
      rowErrors.push(`Recipe sheet, row ${r}: MFR Name is required.`);
      return;
    }

    const batchQty = Number(batchQtyRaw);
    if (!batchQtyRaw || Number.isNaN(batchQty) || batchQty <= 0) {
      rowErrors.push(`Recipe sheet, row ${r} ("${name}"): Batch Size Qty must be a number greater than 0.`);
      return;
    }
    const batchUnit = matchUnit(batchUnitRaw);
    if (!batchUnit) {
      rowErrors.push(`Recipe sheet, row ${r} ("${name}"): Batch Size Unit "${batchUnitRaw}" isn't a valid unit (${UNITS.join(", ")}).`);
      return;
    }

    let item_type_id: string | null = null;
    if (itemTypeRaw) {
      const match = itemTypeByName.get(itemTypeRaw.trim().toLowerCase());
      if (!match) {
        rowErrors.push(
          `Recipe sheet, row ${r} ("${name}"): Item Type "${itemTypeRaw}" doesn't match an existing active Item Type Master description.`
        );
        return;
      }
      item_type_id = match;
    }

    const lineMatches = rawItemByName.get(lineNameRaw.trim().toLowerCase()) ?? [];
    if (!lineNameRaw || lineMatches.length === 0) {
      rowErrors.push(`Recipe sheet, row ${r} ("${name}"): Line Item Name "${lineNameRaw}" doesn't match an existing active Raw Material item.`);
      return;
    }
    if (lineMatches.length > 1) {
      rowErrors.push(
        `Recipe sheet, row ${r} ("${name}"): Line Item Name "${lineNameRaw}" matches ${lineMatches.length} active Raw Material items (${lineMatches.map((it) => it.item_code).join(", ")}) — use a more specific/unique name, or fix the duplicate in Item Master first.`
      );
      return;
    }
    const lineQty = Number(lineQtyRaw);
    if (!lineQtyRaw || Number.isNaN(lineQty) || lineQty <= 0) {
      rowErrors.push(`Recipe sheet, row ${r} ("${name}"): Line Quantity must be a number greater than 0.`);
      return;
    }
    const lineUnit = matchUnit(lineUnitRaw);
    if (!lineUnit) {
      rowErrors.push(`Recipe sheet, row ${r} ("${name}"): Line Unit "${lineUnitRaw}" isn't a valid unit (${UNITS.join(", ")}).`);
      return;
    }
    const newLine: MfrLinePayload = { item_id: lineMatches[0].id, quantity: lineQty, unit: lineUnit };

    // SCAN-P2-09: group by the cleaned name, so "Ashwa Churna" and "ashwa  churna" are one MFR.
    const key = normName(name);
    const existing = groups.get(key);
    if (!existing) {
      if (existingMfrNames.has(key)) {
        rowErrors.push(`Recipe sheet, row ${r}: "${name}" already exists as an MFR.`);
        return;
      }
      groups.set(key, {
        firstRow: r,
        firstProcedureRow: null,
        def: {
          name: name.trim(),
          batch_size_qty: batchQty,
          batch_size_unit: batchUnit,
          item_type_id,
          lines: [newLine],
          procedure_intro: null,
          theoretical_yield_pct: null,
          permissible_yield_pct: null,
          procedure_steps: [],
        },
      });
      return;
    }

    // Every row for the same MFR Name must repeat the same required
    // header fields (batch size, unit, item type) — catches a typo/
    // copy-paste slip before it silently changes the header based on
    // whichever row happened to be inserted first.
    if (existing.def.batch_size_qty !== batchQty || existing.def.batch_size_unit !== batchUnit || existing.def.item_type_id !== item_type_id) {
      rowErrors.push(
        `Recipe sheet, row ${r} ("${name}"): Batch Size Qty / Batch Size Unit / Item Type must match row ${existing.firstRow} — every line for the same MFR Name must repeat the same header values.`
      );
      return;
    }
    // Same Raw Material item added twice as two separate lines under one
    // MFR is almost always a copy-paste slip, not an intentional recipe —
    // rejected so a duplicated ingredient doesn't silently double-count
    // when the batch is actually produced. Combine into one line instead.
    if (existing.def.lines.some((l) => l.item_id === newLine.item_id)) {
      rowErrors.push(
        `Recipe sheet, row ${r} ("${name}"): Line Item Name "${lineNameRaw}" is already a recipe line for this MFR (see an earlier row) — combine into one line instead of repeating it.`
      );
      return;
    }
    existing.def.lines.push(newLine);
  });

  // ---- Manufacturing Procedure sheet: one row = one procedure step, fully optional ----
  procedureSheet.rows.forEach((row, i) => {
    const r = procedureSheet.rowNumbers[i];
    const name = cell(row, procedureSheet.headers, MFR_PROCEDURE_COLUMNS[0]);
    const procedureIntroRaw = cell(row, procedureSheet.headers, MFR_PROCEDURE_COLUMNS[1]);
    const theoreticalYieldRaw = cell(row, procedureSheet.headers, MFR_PROCEDURE_COLUMNS[2]);
    const permissibleYieldRaw = cell(row, procedureSheet.headers, MFR_PROCEDURE_COLUMNS[3]);
    const stageRaw = cell(row, procedureSheet.headers, MFR_PROCEDURE_COLUMNS[4]);
    const operationRaw = cell(row, procedureSheet.headers, MFR_PROCEDURE_COLUMNS[5]);

    if (!name) {
      rowErrors.push(`Manufacturing Procedure sheet, row ${r}: MFR Name is required.`);
      return;
    }
    const key = normName(name);
    const existing = groups.get(key);
    if (!existing) {
      rowErrors.push(
        `Manufacturing Procedure sheet, row ${r}: MFR Name "${name}" doesn't match any MFR Name on the Recipe sheet — every MFR needs at least one recipe line before it can have procedure steps.`
      );
      return;
    }

    if (!stageRaw || !operationRaw) {
      rowErrors.push(`Manufacturing Procedure sheet, row ${r} ("${name}"): Stage and Operation are both required.`);
      return;
    }

    // Procedure Intro / Theoretical Yield % / Permissible Yield % are
    // header-level for the MFR but live only on this sheet now — same
    // "only expected to be filled on ONE row (blank elsewhere is a
    // no-op), but a DIFFERENT non-blank value is a real conflict" rule
    // this had before the sheet split, just checked against
    // firstProcedureRow instead of firstRow now that these fields no
    // longer share a sheet with the recipe-line rows.
    let theoretical_yield_pct: number | null = null;
    if (theoreticalYieldRaw) {
      const n = Number(theoreticalYieldRaw);
      if (!Number.isFinite(n) || n <= 0) {
        rowErrors.push(`Manufacturing Procedure sheet, row ${r} ("${name}"): Theoretical Yield % must be a number greater than 0.`);
        return;
      }
      theoretical_yield_pct = n;
    }
    let permissible_yield_pct: number | null = null;
    if (permissibleYieldRaw) {
      const n = Number(permissibleYieldRaw);
      if (!Number.isFinite(n) || n <= 0) {
        rowErrors.push(`Manufacturing Procedure sheet, row ${r} ("${name}"): Permissible Yield % must be a number greater than 0.`);
        return;
      }
      permissible_yield_pct = n;
    }
    const procedure_intro = procedureIntroRaw.trim() || null;

    if (procedure_intro !== null && existing.def.procedure_intro !== null && procedure_intro !== existing.def.procedure_intro) {
      rowErrors.push(
        `Manufacturing Procedure sheet, row ${r} ("${name}"): Procedure Intro differs from row ${existing.firstProcedureRow} — fill it once per MFR, not with two different values.`
      );
      return;
    }
    if (
      theoretical_yield_pct !== null &&
      existing.def.theoretical_yield_pct !== null &&
      theoretical_yield_pct !== existing.def.theoretical_yield_pct
    ) {
      rowErrors.push(
        `Manufacturing Procedure sheet, row ${r} ("${name}"): Theoretical Yield % differs from row ${existing.firstProcedureRow} — fill it once per MFR, not with two different values.`
      );
      return;
    }
    if (
      permissible_yield_pct !== null &&
      existing.def.permissible_yield_pct !== null &&
      permissible_yield_pct !== existing.def.permissible_yield_pct
    ) {
      rowErrors.push(
        `Manufacturing Procedure sheet, row ${r} ("${name}"): Permissible Yield % differs from row ${existing.firstProcedureRow} — fill it once per MFR, not with two different values.`
      );
      return;
    }
    if (existing.firstProcedureRow === null) existing.firstProcedureRow = r;
    if (procedure_intro !== null && existing.def.procedure_intro === null) existing.def.procedure_intro = procedure_intro;
    if (theoretical_yield_pct !== null && existing.def.theoretical_yield_pct === null) existing.def.theoretical_yield_pct = theoretical_yield_pct;
    if (permissible_yield_pct !== null && existing.def.permissible_yield_pct === null) existing.def.permissible_yield_pct = permissible_yield_pct;

    existing.def.procedure_steps.push({ stage: stageRaw, operation: operationRaw });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  // No "every MFR needs at least one recipe line" check needed here (it
  // used to run after the loop, against a single flat sheet) — every
  // group in `groups` was created by a Recipe-sheet row that already
  // pushed exactly one line onto it, so `lines.length === 0` is now
  // structurally impossible, not just unlikely.
  const payload = Array.from(groups.values()).map((g) => g.def);
  if (payload.length === 0) return { error: "No MFR rows found in that file." };

  const { data, error } = await supabase.rpc("bulk_create_mfr_definitions", { p_payload: payload });
  if (error) return { error: friendlyDbError(error, "Nothing was imported — the MFR upload failed.") };

  // As of 0041_mfr_deferred_approval.sql, bulk-uploaded MFRs land the same
  // way a manually-created one now does: unapproved, with no Finished
  // Product / Packaged FP item pair yet — bulk upload never auto-approves,
  // so each one needs a manual Approve click (on its own /mfr/[id] page)
  // before it can be used for production. See that migration's header
  // comment (Ravi, 14 Sept 2026) for the full reasoning.
  revalidatePath("/mfr");
  const count = data?.length ?? payload.length;
  return {
    success: `Imported ${count} MFR definition${count === 1 ? "" : "s"} — each needs to be approved (on its own MFR page) before it can be used for production.`,
  };
}

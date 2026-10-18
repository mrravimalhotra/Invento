"use server";

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { EQUIPMENT_COLUMNS } from "@/lib/bulk-upload/schemas";
import { friendlyDbError } from "@/lib/db-errors";
import { firstDateError, futureDateError, notAfterDateError } from "@/lib/date-rules";
import { nextCodes, cell, loadSheetOrError, parseOptionalDate, type BulkUploadState } from "@/lib/bulk-upload/server";

// ------------------------------------------------------------------
// Instrument / Equipment Master
// ------------------------------------------------------------------
// P8-01 (18 Oct 2026): the status is worked out from Next Calibration Due, so the
// sheet only says whether the equipment needs calibration. The older words
// Calibrated and Due still load, as Needs Calibration.
const CALIBRATION_STATUS_MAP: Record<string, string> = {
  "needs calibration": "required",
  required: "required",
  calibrated: "required",
  due: "required",
  "not applicable": "not_applicable",
  na: "not_applicable",
  "n/a": "not_applicable",
};

export async function bulkUploadEquipment(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "equipment")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, EQUIPMENT_COLUMNS, "equipment");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows, rowNumbers } = loaded.sheet;

  const supabase = await createClient();
  // Asset ID is the unique key for equipment, not Name — Ravi (14 Sept
  // 2026): "make 'Asset ID' as unique key across application including
  // bulk data upload template and remove unique constraint from Name."
  // Supersedes the Name-based dedup this pass replaces (added 13 Sept
  // 2026) — Equipment Name is now deliberately allowed to repeat within a
  // file (several identical "Wooden Barrels" rows, each with its own
  // distinct Asset ID, is the normal shape for this module's real data).
  // App-level only, no DB constraint — same as every other duplicate
  // check in this app (Ravi's explicit choice, via AskUserQuestion).
  const { data: existingEquipmentRows } = await fetchAllRows((from, to) => supabase.from("equipment").select("asset_id").order("id", { ascending: true }).range(from, to));
  const existingAssetIds = new Set(
    (existingEquipmentRows ?? []).flatMap((e) => (e.asset_id ? [e.asset_id.trim().toLowerCase()] : []))
  );

  type Parsed = {
    name: string;
    room_no: string | null;
    section: string | null;
    asset_id: string | null;
    quantity: number;
    calibration_status: string | null;
    last_calibration_date: string | null;
    next_calibration_due: string | null;
  };

  const rowErrors: string[] = [];
  const parsed: Parsed[] = [];
  const seenAssetIds = new Map<string, number>();

  rows.forEach((row, i) => {
    const r = rowNumbers[i];
    const name = cell(row, headers, EQUIPMENT_COLUMNS[0]);
    const room_no = cell(row, headers, EQUIPMENT_COLUMNS[1]) || null;
    const section = cell(row, headers, EQUIPMENT_COLUMNS[2]) || null;
    const asset_id = cell(row, headers, EQUIPMENT_COLUMNS[3]) || null;
    const quantityRaw = cell(row, headers, EQUIPMENT_COLUMNS[4]);
    const calibRaw = cell(row, headers, EQUIPMENT_COLUMNS[5]);
    const lastCalibRaw = cell(row, headers, EQUIPMENT_COLUMNS[6]);
    const nextCalibRaw = cell(row, headers, EQUIPMENT_COLUMNS[7]);

    if (!name) {
      rowErrors.push(`Row ${r}: Name is required.`);
      return;
    }

    // Asset ID is optional (many equipment rows legitimately have none) —
    // only checked for duplicates when a row actually supplies one.
    if (asset_id) {
      const assetKey = asset_id.toLowerCase();
      if (seenAssetIds.has(assetKey)) {
        rowErrors.push(`Row ${r}: Asset ID "${asset_id}" is repeated on row ${seenAssetIds.get(assetKey)} of this file.`);
        return;
      }
      if (existingAssetIds.has(assetKey)) {
        rowErrors.push(`Row ${r}: Asset ID "${asset_id}" already exists on another equipment record.`);
        return;
      }
      seenAssetIds.set(assetKey, r);
    }

    let quantity = 1;
    if (quantityRaw) {
      const n = Number(quantityRaw);
      if (Number.isNaN(n) || n <= 0 || !Number.isInteger(n)) {
        rowErrors.push(`Row ${r} ("${name}"): Quantity must be a whole number greater than 0.`);
        return;
      }
      quantity = n;
    }

    let calibration_status: string | null = null; // decided below once Next Calibration Due is read
    if (calibRaw) {
      const match = CALIBRATION_STATUS_MAP[calibRaw.trim().toLowerCase()];
      if (!match) {
        rowErrors.push(
          `Row ${r} ("${name}"): Calibration Status must be "Needs Calibration" or "Not Applicable" — got "${calibRaw}".`
        );
        return;
      }
      calibration_status = match;
    }

    const last_calibration_date = parseOptionalDate(lastCalibRaw, "Last Calibration Date", r, rowErrors);
    if (last_calibration_date === undefined) return;
    const next_calibration_due = parseOptionalDate(nextCalibRaw, "Next Calibration Due", r, rowErrors);
    if (next_calibration_due === undefined) return;
    // Date rules (Ravi, 3 Oct 2026), same as the Equipment screen.
    // Blank status: Needs Calibration when a Next Calibration Due date is given, else Not Applicable.
    if (calibration_status === null) calibration_status = next_calibration_due ? "required" : "not_applicable";
    const calibDateError = firstDateError(
      calibration_status === "required" && !next_calibration_due
        ? "Next Calibration Due is required when the equipment needs calibration."
        : null,
      futureDateError(last_calibration_date, "Last Calibration Date"),
      notAfterDateError(next_calibration_due, last_calibration_date, "Next Calibration Due", "the Last Calibration Date")
    );
    if (calibDateError) {
      rowErrors.push(`Row ${r} ("${name}"): ${calibDateError}`);
      return;
    }

    parsed.push({ name, room_no, section, asset_id, quantity, calibration_status, last_calibration_date, next_calibration_due });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const equipmentCodes = await nextCodes(supabase, "get_next_equipment_codes", {}, parsed.length, "equipment");
  if ("error" in equipmentCodes) return { error: equipmentCodes.error };
  const insertRows: Record<string, unknown>[] = [];
  for (const [i, p] of parsed.entries()) {
    insertRows.push({
      equipment_code: equipmentCodes.codes[i],
      name: p.name,
      room_no: p.room_no,
      section: p.section,
      asset_id: p.asset_id,
      quantity: p.quantity,
      calibration_status: p.calibration_status,
      last_calibration_date: p.last_calibration_date,
      next_calibration_due: p.next_calibration_due,
    });
  }

  const { error } = await supabase.from("equipment").insert(insertRows);
  if (error) return { error: friendlyDbError(error, "Nothing was imported — the equipment upload failed.") };

  revalidatePath("/equipment");
  return { success: `Imported ${insertRows.length} equipment record${insertRows.length === 1 ? "" : "s"}.` };
}

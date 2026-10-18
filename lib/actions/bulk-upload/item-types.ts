"use server";

import { normName } from "@/lib/name-rules";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { ITEM_TYPE_COLUMNS } from "@/lib/bulk-upload/schemas";
import { friendlyDbError } from "@/lib/db-errors";
import { cell, loadSheetOrError, type BulkUploadState } from "@/lib/bulk-upload/server";

// ------------------------------------------------------------------
// Item Type Master
// ------------------------------------------------------------------
export async function bulkUploadItemTypes(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "item_types")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, ITEM_TYPE_COLUMNS, "item-types");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows, rowNumbers } = loaded.sheet;

  const supabase = await createClient();
  // item_types.description is DB-unique but Postgres text comparison is
  // case-sensitive — "Powder" and "powder" wouldn't collide at the
  // constraint level and would otherwise create a near-duplicate that's
  // confusing everywhere it's picked from (Item Master, MFR). Checked
  // case-insensitively against every existing item type, active or not,
  // since the constraint itself doesn't care about active status either.
  const { data: existingTypes } = await fetchAllRows((from, to) => supabase.from("item_types").select("description").order("id", { ascending: true }).range(from, to));
  const existingDescriptions = new Set((existingTypes ?? []).map((t) => normName(t.description)));

  const rowErrors: string[] = [];
  const descriptions: string[] = [];
  const seen = new Map<string, number>();

  rows.forEach((row, i) => {
    const r = rowNumbers[i];
    const description = cell(row, headers, ITEM_TYPE_COLUMNS[0]);
    if (!description) {
      rowErrors.push(`Row ${r}: Description is required.`);
      return;
    }
    const key = normName(description);
    if (seen.has(key)) {
      rowErrors.push(`Row ${r}: "${description}" is repeated on row ${seen.get(key)} of this file.`);
      return;
    }
    if (existingDescriptions.has(key)) {
      rowErrors.push(`Row ${r}: "${description}" already exists as an item type.`);
      return;
    }
    seen.set(key, r);
    descriptions.push(description);
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const { error } = await supabase.from("item_types").insert(descriptions.map((description) => ({ description })));
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "One of these descriptions already exists as an item type — nothing was imported."
          : friendlyDbError(error),
    };
  }

  revalidatePath("/item-types");
  return { success: `Imported ${descriptions.length} item type${descriptions.length === 1 ? "" : "s"}.` };
}

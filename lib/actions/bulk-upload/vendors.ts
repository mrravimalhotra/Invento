"use server";

import { normName } from "@/lib/name-rules";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { VENDOR_COLUMNS } from "@/lib/bulk-upload/schemas";
import { friendlyDbError } from "@/lib/db-errors";
import { nextCodes, cell, loadSheetOrError, type BulkUploadState } from "@/lib/bulk-upload/server";

// ------------------------------------------------------------------
// Vendor Master
// ------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function bulkUploadVendors(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "vendors")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, VENDOR_COLUMNS, "vendors");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows, rowNumbers } = loaded.sheet;

  const supabase = await createClient();
  // vendors.name has no DB-level unique constraint at all (vendor_code is
  // the only unique identifier, and it's always server-generated) — so
  // without an app-level check here, two rows with the same name (or a
  // name matching an existing vendor) would both insert cleanly as
  // separate vendors. Checked case-insensitively, same convention as
  // Item Type Master's Description dedup below: "Ambadas" and "ambadas"
  // should collide too. Ravi (13 Sept 2026): "make sure there is
  // validation so it is not allowed to add duplicate Vendors."
  const { data: existingVendors } = await fetchAllRows((from, to) => supabase.from("vendors").select("name").order("id", { ascending: true }).range(from, to));
  const existingNames = new Set((existingVendors ?? []).map((v) => normName(v.name)));

  type Parsed = { name: string; address: string | null; mobile: string | null; phone: string | null; email: string | null };
  const rowErrors: string[] = [];
  const parsed: Parsed[] = [];
  const seenNames = new Map<string, number>();

  rows.forEach((row, i) => {
    const r = rowNumbers[i];
    const name = cell(row, headers, VENDOR_COLUMNS[0]);
    const address = cell(row, headers, VENDOR_COLUMNS[1]) || null;
    const mobile = cell(row, headers, VENDOR_COLUMNS[2]) || null;
    const phone = cell(row, headers, VENDOR_COLUMNS[3]) || null;
    const emailRaw = cell(row, headers, VENDOR_COLUMNS[4]);

    if (!name) {
      rowErrors.push(`Row ${r}: Name is required.`);
      return;
    }
    if (emailRaw && !EMAIL_RE.test(emailRaw)) {
      rowErrors.push(`Row ${r} ("${name}"): "${emailRaw}" isn't a valid email address.`);
      return;
    }
    const nameKey = normName(name);
    if (seenNames.has(nameKey)) {
      rowErrors.push(`Row ${r}: "${name}" is repeated on row ${seenNames.get(nameKey)} of this file.`);
      return;
    }
    if (existingNames.has(nameKey)) {
      rowErrors.push(`Row ${r}: "${name}" already exists as a vendor.`);
      return;
    }
    seenNames.set(nameKey, r);

    parsed.push({ name, address, mobile, phone, email: emailRaw || null });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const vendorCodes = await nextCodes(supabase, "get_next_vendor_codes", {}, parsed.length, "vendor");
  if ("error" in vendorCodes) return { error: vendorCodes.error };
  const insertRows: Record<string, unknown>[] = [];
  for (const [i, p] of parsed.entries()) {
    const vendorCode = vendorCodes.codes[i];
    insertRows.push({ vendor_code: vendorCode, name: p.name, address: p.address, mobile: p.mobile, phone: p.phone, email: p.email });
  }

  const { error } = await supabase.from("vendors").insert(insertRows);
  if (error) return { error: friendlyDbError(error, "Nothing was imported — the vendor upload failed.") };

  revalidatePath("/vendors");
  return { success: `Imported ${insertRows.length} vendor${insertRows.length === 1 ? "" : "s"}.` };
}

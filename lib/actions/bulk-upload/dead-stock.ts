"use server";

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { DEAD_STOCK_COLUMNS } from "@/lib/bulk-upload/schemas";
import { friendlyDbError } from "@/lib/db-errors";
import { beforeDateError, firstDateError, futureDateError } from "@/lib/date-rules";
import { nextCodes, cell, loadSheetOrError, parseOptionalDate, type BulkUploadState } from "@/lib/bulk-upload/server";

// ------------------------------------------------------------------
// Dead Stock Register
// ------------------------------------------------------------------
export async function bulkUploadDeadStock(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "dead_stock")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, DEAD_STOCK_COLUMNS, "dead-stock");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows, rowNumbers } = loaded.sheet;

  const supabase = await createClient();
  // dead_stock_items.article_name has no DB-level unique constraint — same
  // reasoning and pattern as Item/Vendor's name dedup. Ravi (13 Sept 2026,
  // via AskUserQuestion): "add duplicate blocking on ... Dead Stock Article
  // Name ... for both bulk upload and the regular one-at-a-time forms."
  const { data: existingDeadStockRows } = await fetchAllRows((from, to) => supabase.from("dead_stock_items").select("article_name").order("id", { ascending: true }).range(from, to));
  const existingArticleNames = new Set((existingDeadStockRows ?? []).map((d) => d.article_name.trim().toLowerCase()));

  type Parsed = {
    article_name: string;
    date_of_purchase: string | null;
    quantity: number;
    purchase_price: number | null;
    depreciation_pct: number;
    resolution_date: string | null;
    rejected_qty: number;
    rejected_value: number;
    balance_qty: number | null;
    balance_value: number | null;
    remark: string | null;
  };

  const rowErrors: string[] = [];
  const parsed: Parsed[] = [];
  const seenArticleNames = new Map<string, number>();

  rows.forEach((row, i) => {
    const r = rowNumbers[i];
    const article_name = cell(row, headers, DEAD_STOCK_COLUMNS[0]);
    const dateOfPurchaseRaw = cell(row, headers, DEAD_STOCK_COLUMNS[1]);
    const quantityRaw = cell(row, headers, DEAD_STOCK_COLUMNS[2]);
    const purchasePriceRaw = cell(row, headers, DEAD_STOCK_COLUMNS[3]);
    const depreciationRaw = cell(row, headers, DEAD_STOCK_COLUMNS[4]);
    const resolutionDateRaw = cell(row, headers, DEAD_STOCK_COLUMNS[5]);
    const rejectedQtyRaw = cell(row, headers, DEAD_STOCK_COLUMNS[6]);
    const rejectedValueRaw = cell(row, headers, DEAD_STOCK_COLUMNS[7]);
    const balanceQtyRaw = cell(row, headers, DEAD_STOCK_COLUMNS[8]);
    const balanceValueRaw = cell(row, headers, DEAD_STOCK_COLUMNS[9]);
    const remark = cell(row, headers, DEAD_STOCK_COLUMNS[10]) || null;

    if (!article_name) {
      rowErrors.push(`Row ${r}: Name of Article is required.`);
      return;
    }
    const articleKey = article_name.toLowerCase();
    if (seenArticleNames.has(articleKey)) {
      rowErrors.push(`Row ${r}: "${article_name}" is repeated on row ${seenArticleNames.get(articleKey)} of this file.`);
      return;
    }
    if (existingArticleNames.has(articleKey)) {
      rowErrors.push(`Row ${r}: "${article_name}" already exists as a dead stock record.`);
      return;
    }
    seenArticleNames.set(articleKey, r);

    const date_of_purchase = parseOptionalDate(dateOfPurchaseRaw, "Date of Purchase", r, rowErrors);
    if (date_of_purchase === undefined) return;
    const resolution_date = parseOptionalDate(resolutionDateRaw, "Resolution Date", r, rowErrors);
    if (resolution_date === undefined) return;
    // Date rules (Ravi, 3 Oct 2026), same as the Dead Stock screen.
    const deadDateError = firstDateError(
      futureDateError(date_of_purchase, "Date of Purchase"),
      futureDateError(resolution_date, "Resolution Date"),
      beforeDateError(resolution_date, date_of_purchase, "Resolution Date", "the Date of Purchase")
    );
    if (deadDateError) {
      rowErrors.push(`Row ${r} ("${article_name}"): ${deadDateError}`);
      return;
    }

    let quantity = 1;
    if (quantityRaw) {
      const n = Number(quantityRaw);
      if (Number.isNaN(n) || n <= 0) {
        rowErrors.push(`Row ${r} ("${article_name}"): Quantity must be a number greater than 0.`);
        return;
      }
      quantity = n;
    }

    const parseNonNegative = (raw: string, label: string, fallback: number | null): number | null | undefined => {
      if (!raw) return fallback;
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0) {
        rowErrors.push(`Row ${r} ("${article_name}"): ${label} must be a number ≥ 0.`);
        return undefined;
      }
      return n;
    };

    const purchase_price = parseNonNegative(purchasePriceRaw, "Purchase Price", null);
    if (purchase_price === undefined) return;

    let depreciation_pct = 25;
    if (depreciationRaw) {
      const n = Number(depreciationRaw);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        rowErrors.push(`Row ${r} ("${article_name}"): Depreciation % must be a number from 0 to 100.`);
        return;
      }
      depreciation_pct = n;
    }

    const rejected_qty = parseNonNegative(rejectedQtyRaw, "Rejected Qty", 0);
    if (rejected_qty === undefined) return;
    const rejected_value = parseNonNegative(rejectedValueRaw, "Rejected Value", 0);
    if (rejected_value === undefined) return;
    const balance_qty = parseNonNegative(balanceQtyRaw, "Balance Qty", null);
    if (balance_qty === undefined) return;
    const balance_value = parseNonNegative(balanceValueRaw, "Balance Value", null);
    if (balance_value === undefined) return;

    parsed.push({
      article_name,
      date_of_purchase,
      quantity,
      purchase_price,
      depreciation_pct,
      resolution_date,
      rejected_qty: rejected_qty ?? 0,
      rejected_value: rejected_value ?? 0,
      balance_qty,
      balance_value,
      remark,
    });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const assetCodes = await nextCodes(supabase, "get_next_dead_stock_codes", {}, parsed.length, "asset");
  if ("error" in assetCodes) return { error: assetCodes.error };
  const insertRows: Record<string, unknown>[] = [];
  for (const [i, p] of parsed.entries()) {
    insertRows.push({
      asset_code: assetCodes.codes[i],
      article_name: p.article_name,
      date_of_purchase: p.date_of_purchase,
      quantity: p.quantity,
      purchase_price: p.purchase_price,
      depreciation_pct: p.depreciation_pct,
      resolution_date: p.resolution_date,
      rejected_qty: p.rejected_qty,
      rejected_value: p.rejected_value,
      balance_qty: p.balance_qty,
      balance_value: p.balance_value,
      remark: p.remark,
    });
  }

  const { error } = await supabase.from("dead_stock_items").insert(insertRows);
  if (error) return { error: friendlyDbError(error, "Nothing was imported — the dead stock upload failed.") };

  revalidatePath("/dead-stock");
  return { success: `Imported ${insertRows.length} dead stock record${insertRows.length === 1 ? "" : "s"}.` };
}

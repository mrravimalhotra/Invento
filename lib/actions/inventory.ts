"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

// Record wastage — the one write this module owns. Every other row in
// inventory_ledger is written automatically by the triggers in
// 0002_transactions.sql as a side effect of Purchase/QC/Finished
// Product/Packaging inserts; this is the sole direct-user-initiated event.
//
// NOTE (schema gap, flagged in final report / docs/modules/inventory.md):
// record_wastage(p_item_id, p_purchase_line_id, p_quantity, p_unit, p_reason)
// accepts p_reason but inventory_ledger has no reason/notes column, so the
// RPC itself never persists it (see 0002_transactions.sql). We still pass
// it through on every call (future-proof + honors the RPC's contract), and
// require it client-side so the reason is at least captured in the request,
// but until a migration adds inventory_ledger.reason it is not retrievable
// from the ledger afterwards.
export async function recordWastage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const itemId = String(formData.get("itemId") || "").trim();
  const purchaseLineIdRaw = String(formData.get("purchaseLineId") || "").trim();
  const purchaseLineId = purchaseLineIdRaw ? purchaseLineIdRaw : null;
  const quantityRaw = String(formData.get("quantity") || "").trim();
  const unit = String(formData.get("unit") || "").trim();
  const reason = String(formData.get("reason") || "").trim();

  if (!itemId) return { error: "Item is required." };
  const quantity = Number(quantityRaw);
  if (!quantityRaw || Number.isNaN(quantity) || quantity <= 0) {
    return { error: "Quantity must be a positive number." };
  }
  if (!unit) return { error: "Unit is required." };
  if (!reason) return { error: "Reason is required." };

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "inventory")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_wastage", {
    p_item_id: itemId,
    p_purchase_line_id: purchaseLineId,
    p_quantity: quantity,
    p_unit: unit,
    p_reason: reason,
  });
  if (error) {
    // Phase 2 (0029_purchase_line_live_remaining_qty.sql) — the new
    // live_remaining_not_negative check constraint: recording more
    // wastage against a batch than it actually has left is now rejected
    // at the DB level instead of silently succeeding.
    if (error.message.includes("live_remaining_not_negative")) {
      return { error: "Not enough of that batch remaining — check the batch's remaining quantity and try a smaller amount." };
    }
    return { error: error.message };
  }

  revalidatePath("/inventory");
  revalidatePath("/inventory/balance");
  revalidatePath("/inventory/rm-report");
  redirect("/inventory");
}

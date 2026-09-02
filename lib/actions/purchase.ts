"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { convertUnit } from "@/lib/constants/units";

export type ActionState = { error?: string; success?: string } | undefined;

// ------------------------------------------------------------
// Purchase Order (header)
// ------------------------------------------------------------

const poSchema = z.object({
  vendor_id: z.string().uuid({ message: "Select a vendor." }),
  invoice_number: z.string().trim().min(1, "Invoice number is required."),
  invoice_date: z.string().trim().min(1, "Invoice date is required."),
});

export async function createPurchaseOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "purchase")) return { error: "Not authorized." };

  const parsed = poSchema.safeParse({
    vendor_id: String(formData.get("vendor_id") || ""),
    invoice_number: String(formData.get("invoice_number") || ""),
    invoice_date: String(formData.get("invoice_date") || ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();

  // po_number is always generated here via the Postgres RPC, never in JS.
  const { data: poNumber, error: numError } = await supabase.rpc("get_next_po_number");
  if (numError) return { error: numError.message };

  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: poNumber,
      vendor_id: parsed.data.vendor_id,
      invoice_number: parsed.data.invoice_number,
      invoice_date: parsed.data.invoice_date,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/purchase");
  redirect(`/purchase/${data.id}`);
}

// ------------------------------------------------------------
// Purchase Lines (added under a PO)
// ------------------------------------------------------------

// Read-only preview, called from the client the moment an item is selected
// so the batch number can be shown before submit (DESIGN.md §4.4 / §7.1).
// The insert itself (createPurchaseLine below) re-derives the batch number
// from the same RPC rather than trusting this client-displayed value.
export async function previewBatchNumber(itemId: string): Promise<{ batchNumber?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "purchase")) return { error: "Not authorized." };
  if (!itemId) return { error: "No item selected." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_next_batch_number", { p_item_id: itemId });
  if (error) return { error: error.message };
  return { batchNumber: data as string };
}

// FB-0017 (2 Sept 2026): qc_qty/stability_qty/rnd_qty are entered in
// `sample_unit`, which can differ from the line's own `unit` (e.g. QC qty
// in "g" while the line is in "kg") — see purchase-line-form.tsx. The
// bounds check (qc+stability+rnd <= quantity) has to run AFTER converting
// into the line's unit, so it's no longer a zod `.refine` here — it's done
// by hand below, alongside the conversion itself.
const lineSchema = z.object({
  purchase_order_id: z.string().uuid(),
  item_id: z.string().uuid({ message: "Select an item." }),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unit: z.string().trim().min(1, "Unit is required."),
  sample_unit: z.string().trim().min(1, "Sample unit is required."),
  qc_qty: z.coerce.number().min(0, "QC quantity can't be negative.").default(0),
  stability_qty: z.coerce.number().min(0, "Stability quantity can't be negative.").default(0),
  rnd_qty: z.coerce.number().min(0, "R&D quantity can't be negative.").default(0),
  unit_price: z.coerce.number().min(0, "Unit price can't be negative.").optional(),
  gst_pct: z.coerce.number().min(0, "GST % can't be negative.").optional(),
  // Required for raw material, not applicable to packaging (2 Sept 2026) —
  // checked by hand below once the item's real category is known, rather
  // than here, since a packaging line never sends this field at all.
  expiry_date: z.string().trim().optional(),
});

export async function createPurchaseLine(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "purchase")) return { error: "Not authorized." };

  const purchaseOrderIdRaw = String(formData.get("purchase_order_id") || "");
  const itemIdRaw = String(formData.get("item_id") || "");
  const supabaseStatusCheck = await createClient();
  // FB-0018: a submitted PO is locked — lines can only be added while
  // still draft. The Add-line form is already hidden once submitted
  // (app/(dashboard)/purchase/[id]/page.tsx), this is the server-side
  // enforcement in case of a direct POST.
  //
  // Re-Test date (2 Sept 2026): required for raw material, not applicable
  // to packaging — the item's real category is looked up here (not
  // trusted from any client-submitted category field) so the requirement
  // is enforced against the actual item, not whatever the form happened
  // to render.
  const [{ data: poForStatus }, { data: itemForCategory }] = await Promise.all([
    supabaseStatusCheck.from("purchase_orders").select("status").eq("id", purchaseOrderIdRaw).maybeSingle(),
    itemIdRaw ? supabaseStatusCheck.from("items").select("category").eq("id", itemIdRaw).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (poForStatus && poForStatus.status !== "draft") {
    return { error: "Can't add a line — this purchase order has been submitted. Reopen it first." };
  }

  const unitPriceRaw = formData.get("unit_price");
  const gstPctRaw = formData.get("gst_pct");

  const parsed = lineSchema.safeParse({
    purchase_order_id: String(formData.get("purchase_order_id") || ""),
    item_id: String(formData.get("item_id") || ""),
    quantity: String(formData.get("quantity") || ""),
    unit: String(formData.get("unit") || ""),
    sample_unit: String(formData.get("sample_unit") || formData.get("unit") || ""),
    qc_qty: String(formData.get("qc_qty") || "0"),
    stability_qty: String(formData.get("stability_qty") || "0"),
    rnd_qty: String(formData.get("rnd_qty") || "0"),
    unit_price: unitPriceRaw ? String(unitPriceRaw) : undefined,
    gst_pct: gstPctRaw ? String(gstPctRaw) : undefined,
    expiry_date: String(formData.get("expiry_date") || ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const {
    purchase_order_id,
    item_id,
    quantity,
    unit,
    sample_unit,
    qc_qty: qcQtyRaw,
    stability_qty: stabilityQtyRaw,
    rnd_qty: rndQtyRaw,
    unit_price,
    gst_pct,
    expiry_date,
  } = parsed.data;

  const isPackaging = itemForCategory?.category === "packaging";
  if (!isPackaging && !expiry_date) {
    return { error: "Re-Test date is required for raw material." };
  }

  // Convert the sampling quantities from whatever unit they were entered
  // in down to the line's own `unit` — this is what actually gets stored
  // (qc_qty/stability_qty/rnd_qty share one `unit` column with `quantity`
  // and feed the generated `remaining_qty` column, see the insert below).
  const qc_qty = convertUnit(qcQtyRaw, sample_unit, unit);
  const stability_qty = convertUnit(stabilityQtyRaw, sample_unit, unit);
  const rnd_qty = convertUnit(rndQtyRaw, sample_unit, unit);
  if (qc_qty === null || stability_qty === null || rnd_qty === null) {
    return { error: `Sample unit "${sample_unit}" can't be converted to the line unit "${unit}" — pick a compatible unit.` };
  }
  if (qc_qty + stability_qty + rnd_qty > quantity) {
    return { error: "QC + Stability + R&D quantity cannot exceed the received quantity." };
  }

  const supabase = await createClient();

  // batch_number is always generated here via the RPC, never trusted from
  // the client and never generated in JS (AGENT_BRIEFING.md).
  //
  // get_next_batch_number() computes the next number from a count() query,
  // then this insert happens as a separate round trip — nothing serializes
  // the two, so two concurrent purchase-line entries for the same item/year
  // can compute and try to insert the same number. purchase_lines_item_
  // batch_unique (0013_batch_number_integrity.sql) turns that collision
  // into a 23505 instead of a silent duplicate; retry a few times, since a
  // fresh call to get_next_batch_number() will now account for whichever
  // request won the race.
  let error: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: batchNumber, error: batchError } = await supabase.rpc("get_next_batch_number", {
      p_item_id: item_id,
    });
    if (batchError) return { error: batchError.message };

    // remaining_qty is a DB-generated column (quantity - qc_qty -
    // stability_qty - rnd_qty) — not set here. Inserting this row fires
    // trg_purchase_line_push (0002_transactions.sql), which pushes
    // remaining_qty — never the full quantity — onto the inventory ledger
    // automatically.
    const insertResult = await supabase.from("purchase_lines").insert({
      purchase_order_id,
      item_id,
      batch_number: batchNumber,
      quantity,
      unit,
      qc_qty,
      stability_qty,
      rnd_qty,
      unit_price: unit_price ?? null,
      gst_pct: gst_pct ?? null,
      expiry_date: expiry_date || null,
    });
    error = insertResult.error;
    if (!error || error.code !== "23505") break;
  }
  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "Another purchase line for this item was saved at the same moment and took the next batch number — please try saving again.",
      };
    }
    return { error: error.message };
  }

  revalidatePath(`/purchase/${purchase_order_id}`);
  revalidatePath("/purchase");
  return { success: "Line added." };
}

// ------------------------------------------------------------
// Delete (FB-0015: "admin should be able to delete purchase records")
// ------------------------------------------------------------

// Delete is intentionally gated tighter than create/update — canWrite()
// allows system_admin and inventory_manager, but delete is Admin-only,
// same convention as deleteItem()/deleteVendor()/deleteMfrDefinition().
// Matches the po_delete/pl_delete RLS policies in
// 0018_purchase_delete_policy.sql.
export async function deletePurchaseOrder(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.roles?.includes("system_admin")) return { error: "Only System Admin can delete purchase records." };

  const supabase = await createClient();
  // purchase_lines.purchase_order_id is `on delete cascade`, so this also
  // removes every line under the order. If any of those lines have since
  // been QC'd, consumed by MFR/BMR, or have inventory ledger activity,
  // the cascade hits a foreign-key violation and the whole delete rolls
  // back — nothing partial is ever left behind.
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "Can't delete — one or more lines on this purchase order have QC, production, or inventory records on file. Only a purchase order with no downstream activity can be deleted.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/purchase");
  redirect("/purchase");
}

// ------------------------------------------------------------
// Edit / delete a single line (FB-0018: "all users should have access to
// review/edit entered record" before Final Submit)
// ------------------------------------------------------------

// Deliberately narrower than createPurchaseLine's fields: item_id and
// batch_number are NOT editable here. Changing the item after a batch
// number has already been generated against it (get_next_batch_number()
// is per item/year) would either leave a stale batch number or require
// silently regenerating one — safer to have the user delete and re-add
// the line if the item itself was wrong. `unit` is also fixed: quantity/
// qc_qty/stability_qty/rnd_qty are stored as plain numbers against that
// unit, so relabeling it without converting the stored values would
// silently mislabel real data.
const updateLineSchema = z.object({
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  sample_unit: z.string().trim().min(1, "Sample unit is required."),
  qc_qty: z.coerce.number().min(0, "QC quantity can't be negative.").default(0),
  stability_qty: z.coerce.number().min(0, "Stability quantity can't be negative.").default(0),
  rnd_qty: z.coerce.number().min(0, "R&D quantity can't be negative.").default(0),
  unit_price: z.coerce.number().min(0, "Unit price can't be negative.").optional(),
  gst_pct: z.coerce.number().min(0, "GST % can't be negative.").optional(),
  // Required for raw material, not applicable to packaging — see the same
  // note on lineSchema above.
  expiry_date: z.string().trim().optional(),
});

type LineWithPoStatus = {
  unit: string;
  purchase_order_id: string;
  purchase_orders: { status: string } | null;
  item: { category: string } | null;
};

export async function updatePurchaseLine(lineId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "purchase")) return { error: "Not authorized." };

  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase
    .from("purchase_lines")
    .select("unit, purchase_order_id, purchase_orders!inner(status), item:items(category)")
    .eq("id", lineId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!current) return { error: "Purchase line not found." };
  const line = current as unknown as LineWithPoStatus;
  if (line.purchase_orders?.status !== "draft") {
    return { error: "Can't edit — this purchase order has been submitted. Reopen it first." };
  }
  const unit = line.unit;
  const isPackaging = line.item?.category === "packaging";

  const unitPriceRaw = formData.get("unit_price");
  const gstPctRaw = formData.get("gst_pct");
  const parsed = updateLineSchema.safeParse({
    quantity: String(formData.get("quantity") || ""),
    sample_unit: String(formData.get("sample_unit") || unit),
    qc_qty: String(formData.get("qc_qty") || "0"),
    stability_qty: String(formData.get("stability_qty") || "0"),
    rnd_qty: String(formData.get("rnd_qty") || "0"),
    unit_price: unitPriceRaw ? String(unitPriceRaw) : undefined,
    gst_pct: gstPctRaw ? String(gstPctRaw) : undefined,
    expiry_date: String(formData.get("expiry_date") || ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const {
    quantity,
    sample_unit,
    qc_qty: qcQtyRaw,
    stability_qty: stabilityQtyRaw,
    rnd_qty: rndQtyRaw,
    unit_price,
    gst_pct,
    expiry_date,
  } = parsed.data;

  if (!isPackaging && !expiry_date) {
    return { error: "Re-Test date is required for raw material." };
  }

  const qc_qty = convertUnit(qcQtyRaw, sample_unit, unit);
  const stability_qty = convertUnit(stabilityQtyRaw, sample_unit, unit);
  const rnd_qty = convertUnit(rndQtyRaw, sample_unit, unit);
  if (qc_qty === null || stability_qty === null || rnd_qty === null) {
    return { error: `Sample unit "${sample_unit}" can't be converted to the line unit "${unit}" — pick a compatible unit.` };
  }
  if (qc_qty + stability_qty + rnd_qty > quantity) {
    return { error: "QC + Stability + R&D quantity cannot exceed the received quantity." };
  }

  const { error } = await supabase
    .from("purchase_lines")
    .update({
      quantity,
      qc_qty,
      stability_qty,
      rnd_qty,
      unit_price: unit_price ?? null,
      gst_pct: gst_pct ?? null,
      expiry_date: expiry_date || null,
    })
    .eq("id", lineId);
  if (error) return { error: error.message };

  revalidatePath(`/purchase/${line.purchase_order_id}`);
  revalidatePath("/purchase");
  return { success: "Line updated." };
}

export async function deletePurchaseLine(lineId: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "purchase")) return { error: "Not authorized." };

  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase
    .from("purchase_lines")
    .select("purchase_order_id, purchase_orders!inner(status)")
    .eq("id", lineId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!current) return { error: "Purchase line not found." };
  const line = current as unknown as { purchase_order_id: string; purchase_orders: { status: string } | null };
  if (line.purchase_orders?.status !== "draft") {
    return { error: "Can't delete — this purchase order has been submitted. Reopen it first." };
  }

  // A draft line was never pushed to inventory_ledger (FB-0018 — pushing
  // only happens at Final Submit), so this delete can't hit the FK
  // violation deletePurchaseOrder() above has to translate into a
  // friendly message. It's still handled defensively in case something
  // else came to reference the line while it sat in draft (e.g. it was
  // submitted, reopened, and something raced in between).
  const { error } = await supabase.from("purchase_lines").delete().eq("id", lineId);
  if (error) {
    if (error.code === "23503") {
      return { error: "Can't delete — this line has QC, production, or inventory records on file." };
    }
    return { error: error.message };
  }

  revalidatePath(`/purchase/${line.purchase_order_id}`);
  revalidatePath("/purchase");
  return { success: "Line deleted." };
}

// ------------------------------------------------------------
// Final Submit / Reopen (FB-0018)
// ------------------------------------------------------------

// Pushing to inventory_ledger happens entirely inside submit_purchase_
// order() (0019_purchase_submit_workflow.sql) — SECURITY DEFINER, since
// clients can't write inventory_ledger directly (ledger_no_direct_write,
// 0001_init.sql). Same write-role gate as createPurchaseLine/
// createPurchaseOrder (system_admin, inventory_manager); the RPC repeats
// the role check itself server-side as defense in depth.
export async function submitPurchaseOrder(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "purchase")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_purchase_order", { p_po_id: id });
  if (error) return { error: error.message };

  revalidatePath(`/purchase/${id}`);
  revalidatePath("/purchase");
  return { success: "Purchase order submitted — inventory has been updated." };
}

// Admin-only, matching deletePurchaseOrder()'s convention — reversing
// already-committed inventory is a materially bigger action than editing
// a still-draft line, so it's gated tighter than plain write access.
export async function reopenPurchaseOrder(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.roles?.includes("system_admin")) return { error: "Only System Admin can reopen a submitted purchase order." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_purchase_order", { p_po_id: id });
  if (error) return { error: error.message };

  revalidatePath(`/purchase/${id}`);
  revalidatePath("/purchase");
  return { success: "Purchase order reopened for editing — inventory pushed by it has been reversed." };
}

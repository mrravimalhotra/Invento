"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";

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

const lineSchema = z
  .object({
    purchase_order_id: z.string().uuid(),
    item_id: z.string().uuid({ message: "Select an item." }),
    quantity: z.coerce.number().positive("Quantity must be greater than zero."),
    unit: z.string().trim().min(1, "Unit is required."),
    qc_qty: z.coerce.number().min(0, "QC quantity can't be negative.").default(0),
    stability_qty: z.coerce.number().min(0, "Stability quantity can't be negative.").default(0),
    rnd_qty: z.coerce.number().min(0, "R&D quantity can't be negative.").default(0),
    unit_price: z.coerce.number().min(0, "Unit price can't be negative.").optional(),
    gst_pct: z.coerce.number().min(0, "GST % can't be negative.").optional(),
    expiry_date: z.string().trim().min(1, "Expiry date is required."),
  })
  .refine((v) => v.qc_qty + v.stability_qty + v.rnd_qty <= v.quantity, {
    message: "QC + Stability + R&D quantity cannot exceed the received quantity.",
    path: ["qc_qty"],
  });

export async function createPurchaseLine(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "purchase")) return { error: "Not authorized." };

  const unitPriceRaw = formData.get("unit_price");
  const gstPctRaw = formData.get("gst_pct");

  const parsed = lineSchema.safeParse({
    purchase_order_id: String(formData.get("purchase_order_id") || ""),
    item_id: String(formData.get("item_id") || ""),
    quantity: String(formData.get("quantity") || ""),
    unit: String(formData.get("unit") || ""),
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
    qc_qty,
    stability_qty,
    rnd_qty,
    unit_price,
    gst_pct,
    expiry_date,
  } = parsed.data;

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
      expiry_date,
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

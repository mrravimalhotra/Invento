"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";

export type ActionState = { error?: string; success?: string } | undefined;

const numeric = (label: string) =>
  z.coerce.number({ error: `${label} must be a number.` }).nonnegative(`${label} can't be negative.`);

const deadStockSchema = z.object({
  article_name: z.string().trim().min(1, "Name of the article is required."),
  date_of_purchase: z.string().trim().optional(),
  quantity: numeric("Quantity").positive("Quantity must be greater than zero.").default(1),
  purchase_price: numeric("Purchase price").optional(),
  depreciation_pct: numeric("Depreciation %").max(100, "Depreciation % can't exceed 100.").default(25),
  resolution_date: z.string().trim().optional(),
  rejected_qty: numeric("Rejected qty").default(0),
  rejected_value: numeric("Rejected value").default(0),
  balance_qty: numeric("Balance qty").optional(),
  balance_value: numeric("Balance value").optional(),
  remark: z.string().trim().optional(),
});

function parseDeadStockForm(formData: FormData) {
  return deadStockSchema.safeParse({
    article_name: String(formData.get("article_name") || ""),
    date_of_purchase: String(formData.get("date_of_purchase") || ""),
    quantity: String(formData.get("quantity") || "1"),
    purchase_price: String(formData.get("purchase_price") || ""),
    depreciation_pct: String(formData.get("depreciation_pct") || "25"),
    resolution_date: String(formData.get("resolution_date") || ""),
    rejected_qty: String(formData.get("rejected_qty") || "0"),
    rejected_value: String(formData.get("rejected_value") || "0"),
    balance_qty: String(formData.get("balance_qty") || ""),
    balance_value: String(formData.get("balance_value") || ""),
    remark: String(formData.get("remark") || ""),
  });
}

export async function createDeadStockItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "dead_stock")) return { error: "Not authorized." };

  const parsed = parseDeadStockForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: assetCode, error: codeError } = await supabase.rpc("get_next_dead_stock_code");
  if (codeError) return { error: codeError.message };

  const { error } = await supabase.from("dead_stock_items").insert({
    asset_code: assetCode,
    article_name: parsed.data.article_name,
    date_of_purchase: parsed.data.date_of_purchase || null,
    quantity: parsed.data.quantity,
    purchase_price: parsed.data.purchase_price ?? null,
    depreciation_pct: parsed.data.depreciation_pct,
    resolution_date: parsed.data.resolution_date || null,
    rejected_qty: parsed.data.rejected_qty,
    rejected_value: parsed.data.rejected_value,
    balance_qty: parsed.data.balance_qty ?? null,
    balance_value: parsed.data.balance_value ?? null,
    remark: parsed.data.remark || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/dead-stock");
  redirect(`/dead-stock?created=${encodeURIComponent(assetCode)}`);
}

export async function updateDeadStockItem(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "dead_stock")) return { error: "Not authorized." };

  const parsed = parseDeadStockForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const active = formData.get("active") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("dead_stock_items")
    .update({
      article_name: parsed.data.article_name,
      date_of_purchase: parsed.data.date_of_purchase || null,
      quantity: parsed.data.quantity,
      purchase_price: parsed.data.purchase_price ?? null,
      depreciation_pct: parsed.data.depreciation_pct,
      resolution_date: parsed.data.resolution_date || null,
      rejected_qty: parsed.data.rejected_qty,
      rejected_value: parsed.data.rejected_value,
      // balance_qty/balance_value are deliberately plain editable fields,
      // not auto-computed — see the note in 0035_dead_stock_register.sql.
      // Whoever records a rejection updates the balance by hand, matching
      // how the real register is maintained today.
      balance_qty: parsed.data.balance_qty ?? null,
      balance_value: parsed.data.balance_value ?? null,
      remark: parsed.data.remark || null,
      active,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dead-stock");
  revalidatePath(`/dead-stock/${id}`);
  return { success: "Dead stock record updated." };
}

export async function deleteDeadStockItem(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  // Admin-only, matching every other master-data delete convention.
  const user = await getCurrentUser();
  if (!user?.roles?.includes("system_admin")) return { error: "Only System Admin can delete dead stock records." };

  const supabase = await createClient();
  const { error } = await supabase.from("dead_stock_items").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dead-stock");
  redirect("/dead-stock");
}

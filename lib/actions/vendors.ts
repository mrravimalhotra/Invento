"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";

export type ActionState = { error?: string; success?: string } | undefined;

const vendorSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  address: z.string().trim().optional(),
  mobile: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "Enter a valid email.",
    })
    .optional(),
});

function parseVendorForm(formData: FormData) {
  return vendorSchema.safeParse({
    name: String(formData.get("name") || ""),
    address: String(formData.get("address") || ""),
    mobile: String(formData.get("mobile") || ""),
    phone: String(formData.get("phone") || ""),
    email: String(formData.get("email") || ""),
  });
}

export async function createVendor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "vendors")) return { error: "Not authorized." };

  const parsed = parseVendorForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: vendorCode, error: codeError } = await supabase.rpc("get_next_vendor_code");
  if (codeError) return { error: codeError.message };

  const { error } = await supabase.from("vendors").insert({
    vendor_code: vendorCode,
    name: parsed.data.name,
    address: parsed.data.address || null,
    mobile: parsed.data.mobile || null,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/vendors");
  // Redirects back to the list (not the new vendor's detail page) — the
  // Add-vendor form lives inline on /vendors now (see vendor-form.tsx's
  // NewVendorForm), so save-and-stay-on-this-screen is the point: the
  // admin can see the new row appear and the next code preview refresh,
  // ready to add another one right away. ?created= carries the vendor
  // code (not the id — there's no detail-page navigation to key off of
  // here) so the list page can find the row and show a one-time success
  // banner, same mechanic as FB-0005's item ?created=1.
  redirect(`/vendors?created=${encodeURIComponent(vendorCode)}`);
}

export async function updateVendor(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "vendors")) return { error: "Not authorized." };

  const parsed = parseVendorForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({
      name: parsed.data.name,
      address: parsed.data.address || null,
      mobile: parsed.data.mobile || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  return { success: "Vendor updated." };
}

export async function deleteVendor(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  // Delete is intentionally gated tighter than create/update — canWrite()
  // allows system_admin and inventory_manager, but delete is Admin-only,
  // same convention as deleteItemType() / deleteItem() (FB-0004 and the
  // follow-up "delete access for all master data" request). Matches the
  // vendors_delete RLS policy in 0009_master_data_delete_policy.sql.
  const user = await getCurrentUser();
  if (!user?.roles?.includes("system_admin")) return { error: "Only System Admin can delete vendors." };

  const supabase = await createClient();
  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return { error: "Can't delete — this vendor has purchase orders on file. Reassign or remove those first." };
    }
    return { error: error.message };
  }

  revalidatePath("/vendors");
  redirect("/vendors");
}

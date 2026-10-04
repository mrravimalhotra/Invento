"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/db-errors";

export type CompanyFormState = { error?: string; success?: string } | undefined;

// FB-0046 (4 Oct 2026): the company name, address and licence number printed on
// every report and document are edited here (System Administrator only; the
// database function checks the role again).
export async function saveCompanySettings(_prev: CompanyFormState, formData: FormData): Promise<CompanyFormState> {
  const user = await getCurrentUser();
  if (!user?.roles.includes("system_admin")) return { error: "Only the System Administrator can change the company details." };

  const name = String(formData.get("company_name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const label = String(formData.get("licence_label") ?? "").trim();
  const licence = String(formData.get("licence_no") ?? "").trim();
  if (!name) return { error: "Company name is required." };
  if (!label) return { error: "Licence label is required." };
  if (!licence) return { error: "Licence number is required." };
  if (name.length > 120) return { error: "Company name is too long (120 characters at most)." };
  if (address.length > 200) return { error: "Address is too long (200 characters at most)." };
  if (label.length > 60 || licence.length > 60) return { error: "Licence label and number can be 60 characters at most." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_company_settings", {
    p_company_name: name,
    p_address: address,
    p_licence_label: label,
    p_licence_no: licence,
  });
  if (error) return { error: friendlyDbError(error, "Could not save the company details.") };

  // The details are read by the layout on every page, so refresh them all.
  revalidatePath("/", "layout");
  return { success: "Saved. New reports and documents use these details; ones already downloaded are not changed." };
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PurchaseOrderForm } from "../new-purchase-order-form";
import type { RawItemOption } from "../purchase-line-form";

export default async function NewPurchaseOrderPage() {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "purchase")) redirect("/purchase");

  const supabase = await createClient();
  // Both fetched up front, not just vendors: the moment the header's
  // saved, this same screen renders the full PurchaseOrderView in place
  // (13 Sept 2026, single-screen Purchase flow) — items is what its
  // Add-line form needs, same query [id]/page.tsx runs for an existing PO.
  const [{ data: vendors }, { data: rawItems }] = await Promise.all([
    supabase.from("vendors").select("id, vendor_code, name").eq("active", true).order("name"),
    supabase
      .from("items")
      .select("id, item_code, name, unit, category, default_qc_qty, default_stability_qty, default_rnd_qty, default_sample_unit")
      .in("category", ["raw", "packaging"])
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);

  const isSystemAdmin = (user?.roles ?? []).includes("system_admin");

  return <PurchaseOrderForm vendors={vendors ?? []} items={(rawItems ?? []) as RawItemOption[]} isSystemAdmin={isSystemAdmin} />;
}

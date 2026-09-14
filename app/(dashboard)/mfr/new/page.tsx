import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { NewMfrForm } from "./new-mfr-form";

export default async function NewMfrPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!canWrite(user?.roles ?? [], "mfr")) redirect("/mfr");

  const [{ data: itemTypes }, { data: rawItems }] = await Promise.all([
    supabase.from("item_types").select("id, description").eq("active", true).order("description"),
    supabase
      .from("items")
      .select("id, item_code, name, unit")
      .eq("category", "raw")
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);
  // No more next-FP-code preview here (FB-0010's peek_next_item_code
  // call, removed): as of 0041_mfr_deferred_approval.sql the Finished
  // Product item isn't created — and its code isn't assigned — until this
  // MFR is approved, which may happen long after other MFRs have been
  // created and approved in between. A code peeked at creation time would
  // very likely no longer match what's actually assigned by then, so
  // showing one here would be actively misleading rather than a useful
  // preview.

  return (
    <div>
      <PageHeader
        title="New MFR"
        description="Define the header and the initial recipe (version 1). Recipe lines only draw from raw-material items."
      />
      <Card>
        <CardBody>
          <NewMfrForm itemTypes={itemTypes ?? []} rawItems={rawItems ?? []} />
        </CardBody>
      </Card>
    </div>
  );
}

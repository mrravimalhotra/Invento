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
      .order("item_code"),
  ]);

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

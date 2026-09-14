import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Step1Form } from "./step1-form";

export default async function NewFinishedProductPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!canWrite(user?.roles ?? [], "finished_product")) redirect("/finished-product");

  // approved_by is not null as of 0041_mfr_deferred_approval.sql — Ravi
  // (14 Sept 2026): Finished Product / Packaged FP items for an MFR are
  // now only created on approval, so producing against a still-unapproved
  // recipe would have no item to push the eventual yield onto. This
  // closes that gap by only ever offering approved (and active) MFRs
  // here, not just active ones.
  const { data: mfrDefinitions } = await supabase
    .from("mfr_definitions")
    .select("id, code, name, version, batch_size_qty, batch_size_unit")
    .eq("active", true)
    .not("approved_by", "is", null)
    .order("code");

  return (
    <div>
      <PageHeader
        title="New Finished Product Batch"
        description="Step 1 of 2 — pick the MFR to build from. Its current recipe version is locked into this batch now, even if the MFR changes later."
      />
      <Card>
        <CardBody>
          <Step1Form mfrDefinitions={mfrDefinitions ?? []} />
        </CardBody>
      </Card>
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { BmrTable, type BmrRow } from "./bmr-table";

export default async function BmrListPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("bmr_records")
    .select("id, prepared_at, checked_at, approved_at, finished_product_batches(batch_number)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as BmrRow[];
  const canCreate = canWrite(user?.roles ?? [], "bmr");

  return (
    <div>
      <PageHeader
        title="Batch Manufacturing Record"
        description="One BMR per finished product batch — weighment lines, in-process observations, and Prepared / Checked / Approved sign-off."
        action={canCreate ? <LinkButton href="/bmr/new">New BMR</LinkButton> : undefined}
      />
      <Card>
        <BmrTable rows={rows} />
      </Card>
    </div>
  );
}

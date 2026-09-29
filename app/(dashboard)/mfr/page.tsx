import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { MfrTable, type MfrRow } from "./mfr-table";

export default async function MfrListPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await fetchAllRows((from, to) =>
    supabase
      .from("mfr_definitions")
      .select(
        "id, code, name, version, batch_size_qty, batch_size_unit, approved_by, approved_at, active, items:finished_product_item_id(id, item_code, item_types(description))"
      )
      .order("code", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );

  const rows = (data ?? []) as unknown as MfrRow[];
  const canCreate = canWrite(user?.roles ?? [], "mfr");

  return (
    <div>
      <PageHeader
        title="Master Formula Record (MFR)"
        description="Recipes for finished products — editable only before approval; once approved, a recipe is locked."
        action={canCreate ? <LinkButton href="/mfr/new">New MFR</LinkButton> : undefined}
      />
      <Card>
        <MfrTable rows={rows} />
      </Card>
    </div>
  );
}

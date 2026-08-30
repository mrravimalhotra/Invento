import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { MfrTable, type MfrRow } from "./mfr-table";

export default async function MfrListPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("mfr_definitions")
    .select(
      "id, code, name, version, batch_size_qty, batch_size_unit, approved_by, approved_at, item_types(description)"
    )
    .eq("active", true)
    .order("code", { ascending: true });

  const rows = (data ?? []) as unknown as MfrRow[];
  const canCreate = canWrite(user?.roles ?? [], "mfr");

  return (
    <div>
      <PageHeader
        title="Master Formula Record (MFR)"
        description="Approved recipes for finished products — versioned so a past edit never silently overwrites the record on file."
        action={canCreate ? <LinkButton href="/mfr/new">New MFR</LinkButton> : undefined}
      />
      <Card>
        <MfrTable rows={rows} />
      </Card>
    </div>
  );
}

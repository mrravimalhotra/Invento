import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { ItemTypesTable, type ItemTypeRow } from "./item-types-table";

export default async function ItemTypesPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("item_types")
    .select("id, description, active")
    .order("description", { ascending: true });

  const rows: ItemTypeRow[] = data ?? [];
  const canCreate = canWrite(user?.roles ?? [], "item_types");

  return (
    <div>
      <PageHeader
        title="Item Type Master"
        description="Categorizes items on the Item Master screen (e.g. Herb, Excipient, Bottle)."
        action={canCreate ? <LinkButton href="/item-types/new">New item type</LinkButton> : undefined}
      />
      <Card>
        <ItemTypesTable rows={rows} />
      </Card>
    </div>
  );
}

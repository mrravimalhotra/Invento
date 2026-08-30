import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { NewItemTypeForm } from "./item-type-form";
import { ItemTypesTable, type ItemTypeRow } from "./item-types-table";

export default async function ItemTypesPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("item_types")
    .select("id, description, active, created_at")
    .order("description", { ascending: true });

  const rows: ItemTypeRow[] = data ?? [];
  const canCreate = canWrite(user?.roles ?? [], "item_types");

  return (
    <div>
      <PageHeader
        title="Item Type Master"
        description="Categorizes items on the Item Master screen (e.g. Herb, Excipient, Bottle)."
      />
      {/* Add form and list share the page — no navigating to a separate
          /new screen and back just to add one item type. */}
      <div className={canCreate ? "grid items-start gap-6 lg:grid-cols-[320px_1fr]" : undefined}>
        {canCreate && (
          <Card className="lg:sticky lg:top-4">
            <CardHeader title="Add new item type" />
            <CardBody>
              <NewItemTypeForm />
            </CardBody>
          </Card>
        )}
        <Card>
          <ItemTypesTable rows={rows} />
        </Card>
      </div>
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EditItemTypeForm, DeleteItemTypeForm } from "../item-type-form";

export default async function EditItemTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: itemType } = await supabase
    .from("item_types")
    .select("id, description, active")
    .eq("id", id)
    .maybeSingle();

  if (!itemType) notFound();

  const readOnly = !canWrite(user.roles, "item_types");
  const isSystemAdmin = user.roles.includes("system_admin");

  return (
    <div>
      <PageHeader title={itemType.description} description={readOnly ? "Read-only — you don't have write access to Item Type Master." : "Edit this item type."} />
      <Card className="max-w-md">
        <CardBody>
          {readOnly ? (
            <p className="text-sm text-muted">
              Status: {itemType.active ? "Active" : "Inactive"}
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              <EditItemTypeForm id={itemType.id} defaultDescription={itemType.description} defaultActive={itemType.active} />
              {isSystemAdmin && <DeleteItemTypeForm id={itemType.id} description={itemType.description} />}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

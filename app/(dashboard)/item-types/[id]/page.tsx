import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EditItemTypeForm } from "../item-type-form";

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
            <EditItemTypeForm id={itemType.id} defaultDescription={itemType.description} defaultActive={itemType.active} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { NewItemForm } from "../item-form";

export default async function NewItemPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "items")) redirect("/items");

  const supabase = await createClient();
  const { data: itemTypes } = await supabase
    .from("item_types")
    .select("id, description")
    .eq("active", true)
    .order("description", { ascending: true });

  return (
    <div>
      <PageHeader
        title="New item"
        description="Item code is generated automatically once you save (RM- / PKG- / FP- prefixed)."
      />
      <Card className="max-w-3xl">
        <CardBody>
          <NewItemForm itemTypes={itemTypes ?? []} />
        </CardBody>
      </Card>
    </div>
  );
}

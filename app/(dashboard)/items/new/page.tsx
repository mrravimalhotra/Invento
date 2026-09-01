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
  const [{ data: itemTypes }, { data: nextRaw }, { data: nextPkg }] = await Promise.all([
    supabase.from("item_types").select("id, description").eq("active", true).order("description", { ascending: true }),
    // peek_next_item_code() reads the sequence without consuming it (see
    // 0012_peek_next_codes.sql) — fetching both raw/packaging previews up
    // front lets the Category select switch between them client-side with
    // no round trip.
    supabase.rpc("peek_next_item_code", { p_category: "raw" }),
    supabase.rpc("peek_next_item_code", { p_category: "packaging" }),
  ]);

  return (
    <div>
      <PageHeader
        title="New item"
        description="Item code is generated automatically once you save (RM- / PKG- prefixed). Finished products are created from MFR → New MFR instead."
      />
      <Card className="max-w-3xl">
        <CardBody>
          <NewItemForm
            itemTypes={itemTypes ?? []}
            nextCodes={{ raw: nextRaw ?? "RM-…", packaging: nextPkg ?? "PKG-…" }}
          />
        </CardBody>
      </Card>
    </div>
  );
}

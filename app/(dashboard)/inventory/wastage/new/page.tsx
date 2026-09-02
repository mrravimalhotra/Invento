import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { WastageForm } from "../wastage-form";

export default async function NewWastagePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "inventory")) redirect("/inventory");

  const supabase = await createClient();
  const [{ data: items }, { data: purchaseLines }] = await Promise.all([
    supabase
      .from("items")
      .select("id, name, item_code, unit")
      .eq("active", true)
      .order("created_at", { ascending: false }),
    // FB-0018: a draft line was never pushed to inventory (see
    // 0019_purchase_submit_workflow.sql) — offering it here would let
    // wastage be recorded against a batch that never actually became
    // stock.
    supabase
      .from("purchase_lines")
      .select("id, item_id, batch_number, remaining_qty, unit, purchase_orders!inner(status)")
      .eq("active", true)
      .eq("purchase_orders.status", "submitted")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <PageHeader
        title="Record wastage"
        description="Writes a 'wastage' event to the inventory ledger via the record_wastage() database function. Item and (optionally) batch are required; the RPC's own role check is the real enforcement."
      />
      <Card className="max-w-xl">
        <CardBody>
          <WastageForm items={items ?? []} purchaseLines={purchaseLines ?? []} />
        </CardBody>
      </Card>
    </div>
  );
}

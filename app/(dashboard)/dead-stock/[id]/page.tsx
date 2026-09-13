import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EditDeadStockForm, DeleteDeadStockForm } from "../dead-stock-form";

export default async function DeadStockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("dead_stock_items")
    .select(
      "id, asset_code, article_name, date_of_purchase, quantity, purchase_price, depreciation_pct, depreciated_unit_value, resolution_date, rejected_qty, rejected_value, balance_qty, balance_value, remark, active"
    )
    .eq("id", id)
    .maybeSingle();

  if (!item) notFound();

  const canEdit = canWrite(user?.roles ?? [], "dead_stock");
  const isSystemAdmin = (user?.roles ?? []).includes("system_admin");

  return (
    <div>
      <PageHeader title={item.article_name} description={`Asset ${item.asset_code}`} />
      <Card className="max-w-xl">
        <CardBody>
          {canEdit ? (
            <div className="flex flex-col gap-6">
              <EditDeadStockForm item={item} />
              {isSystemAdmin && <DeleteDeadStockForm id={item.id} name={item.article_name} />}
            </div>
          ) : (
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Quantity</dt>
                <dd>{item.quantity}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Purchase price / unit</dt>
                <dd>{item.purchase_price ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Depreciation %</dt>
                <dd>{item.depreciation_pct}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Balance qty / value</dt>
                <dd>
                  {item.balance_qty ?? "—"} / {item.balance_value ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Remark</dt>
                <dd>{item.remark ?? "—"}</dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

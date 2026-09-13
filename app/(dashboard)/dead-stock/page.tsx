import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { NewDeadStockForm } from "./dead-stock-form";
import { DeadStockTable, type DeadStockRow } from "./dead-stock-table";

export default async function DeadStockPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const canCreate = canWrite(user?.roles ?? [], "dead_stock");

  const [{ data, error }, nextAssetCode] = await Promise.all([
    supabase
      .from("dead_stock_items")
      .select(
        "id, asset_code, article_name, date_of_purchase, quantity, purchase_price, depreciation_pct, depreciated_unit_value, balance_qty, balance_value"
      )
      .eq("active", true)
      .order("asset_code"),
    // Non-consuming preview (0035_dead_stock_register.sql) — skip the call
    // entirely when the Add-asset panel won't render.
    canCreate ? supabase.rpc("peek_next_dead_stock_code").then((r) => r.data ?? "DS-…") : Promise.resolve(null),
  ]);

  const rows = (data ?? []) as DeadStockRow[];
  const createdRow = created ? rows.find((r) => r.asset_code === created) : undefined;

  return (
    <div>
      <PageHeader
        title="Dead Stock Register"
        description="Asset register (furniture, equipment, etc.) with depreciation. Asset code is generated automatically on create. Balance qty/value are entered by hand, matching how this register is maintained today — not an auto-computed ledger."
      />

      {createdRow && (
        <p className="mb-4 rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
          New asset &quot;{createdRow.article_name}&quot; ({createdRow.asset_code}) has been successfully added.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-red">{error.message}</p>}

      <div className={canCreate ? "grid items-start gap-6 lg:grid-cols-[360px_1fr]" : undefined}>
        {canCreate && nextAssetCode && (
          <Card className="lg:sticky lg:top-4">
            <CardHeader title="Add new asset" />
            <CardBody>
              <NewDeadStockForm nextAssetCode={nextAssetCode} />
            </CardBody>
          </Card>
        )}
        <Card>
          <DeadStockTable rows={rows} />
        </Card>
      </div>
    </div>
  );
}

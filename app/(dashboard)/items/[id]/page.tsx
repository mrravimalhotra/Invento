import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { EditItemForm } from "../item-form";
import { Barcode } from "../barcode";
import { formatNumber } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  raw: "Raw material",
  processed: "Finished product",
  packaging: "Packaging",
};

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: item }, { data: itemTypes }, { data: balance }] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, item_code, name, botanical_alias, category, item_type_id, unit, default_qc_qty, default_stability_qty, default_rnd_qty, default_sample_unit, low_stock_threshold, barcode, active"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("item_types").select("id, description").eq("active", true).order("description", { ascending: true }),
    supabase.from("stock_balance").select("on_hand").eq("item_id", id).maybeSingle(),
  ]);

  if (!item) notFound();

  const readOnly = !canWrite(user.roles, "items");
  const onHand = balance?.on_hand != null ? Number(balance.on_hand) : 0;
  const isLow = item.low_stock_threshold != null && onHand < Number(item.low_stock_threshold);

  return (
    <div>
      <PageHeader
        title={item.name}
        description={`${item.item_code} · ${CATEGORY_LABELS[item.category] ?? item.category}${readOnly ? " · Read-only — you don't have write access to Item Master." : ""}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Stock on hand" value={`${formatNumber(onHand)}${item.unit ? ` ${item.unit}` : ""}`} />
        <StatCard label="Low stock" value={isLow ? "Yes" : "No"} />
        <StatCard label="Item code" value={item.item_code} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <CardBody>
            {readOnly ? (
              <ReadOnlyDetails item={item} />
            ) : (
              <EditItemForm id={item.id} itemTypes={itemTypes ?? []} item={item} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Barcode" />
          <CardBody className="flex justify-center">
            {item.barcode ? <Barcode value={item.barcode} /> : <p className="text-sm text-muted">No barcode on file.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ReadOnlyDetails({
  item,
}: {
  item: {
    name: string;
    botanical_alias: string | null;
    category: string;
    unit: string | null;
    default_qc_qty: string | number | null;
    default_stability_qty: string | number | null;
    default_rnd_qty: string | number | null;
    default_sample_unit: string | null;
    low_stock_threshold: string | number | null;
    barcode: string | null;
    active: boolean;
  };
}) {
  const rows: [string, React.ReactNode][] = [
    ["Name", item.name],
    ["Botanical alias", item.botanical_alias ?? "—"],
    ["Category", CATEGORY_LABELS[item.category] ?? item.category],
    ["Unit", item.unit ?? "—"],
    ["Default QC qty", formatNumber(item.default_qc_qty)],
    ["Default stability qty", formatNumber(item.default_stability_qty)],
    ["Default R&D qty", formatNumber(item.default_rnd_qty)],
    ["Default sample unit", item.default_sample_unit ?? "— same as item unit —"],
    ["Low stock threshold", formatNumber(item.low_stock_threshold)],
    ["Barcode", item.barcode ?? "—"],
    ["Status", item.active ? "Active" : "Inactive"],
  ];
  return (
    <div className="grid gap-2.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between border-b border-border/60 pb-2 last:border-0">
          <span className="text-muted">{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}

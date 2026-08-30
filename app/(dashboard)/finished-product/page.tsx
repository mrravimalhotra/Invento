import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { latestQcByBatch } from "@/lib/finished-product-status";
import { FinishedProductTable, type FpRow } from "./finished-product-table";

type FpQueryRow = {
  id: string;
  batch_number: string;
  target_qty: string | number;
  unit: string;
  actual_yield_pct: string | number | null;
  finish_date: string | null;
  status: string;
  mfr_definitions: { name: string } | null;
};

export default async function FinishedProductListPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("finished_product_batches")
    .select("id, batch_number, target_qty, unit, actual_yield_pct, finish_date, status, mfr_definitions(name)")
    .eq("active", true)
    .order("created_at", { ascending: false });

  const fpRows = (data ?? []) as unknown as FpQueryRow[];

  const { data: qcRows } = fpRows.length
    ? await supabase
        .from("quality_checks")
        .select("finished_product_batch_id, status, created_at")
        .in(
          "finished_product_batch_id",
          fpRows.map((r) => r.id)
        )
        .not("finished_product_batch_id", "is", null)
    : { data: [] };

  const latestQc = latestQcByBatch((qcRows ?? []) as { finished_product_batch_id: string; status: string; created_at: string }[]);
  const rows: FpRow[] = fpRows.map((r) => ({ ...r, latestQcStatus: latestQc.get(r.id)?.status }));
  const canCreate = canWrite(user?.roles ?? [], "finished_product");

  return (
    <div>
      <PageHeader
        title="Finished Product"
        description="Production batches built from an approved MFR — recipe scaled to target quantity, RM batches drawn FIFO from QC-Approved stock only."
        action={canCreate ? <LinkButton href="/finished-product/new">New batch</LinkButton> : undefined}
      />
      <Card>
        <FinishedProductTable rows={rows} />
      </Card>
    </div>
  );
}

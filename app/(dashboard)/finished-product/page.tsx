import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber } from "@/lib/utils";
import { latestQcByBatch, resolveDisplayStatus } from "@/lib/finished-product-status";

type FpRow = {
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

  const rows = (data ?? []) as unknown as FpRow[];

  const { data: qcRows } = rows.length
    ? await supabase
        .from("quality_checks")
        .select("finished_product_batch_id, status, created_at")
        .in(
          "finished_product_batch_id",
          rows.map((r) => r.id)
        )
        .not("finished_product_batch_id", "is", null)
    : { data: [] };

  const latestQc = latestQcByBatch((qcRows ?? []) as { finished_product_batch_id: string; status: string; created_at: string }[]);
  const canCreate = canWrite(user?.roles ?? [], "finished_product");

  const columns: Column<FpRow>[] = [
    {
      header: "Batch",
      accessor: (r) => (
        <Link href={`/finished-product/${r.id}`} className="font-medium text-brand hover:underline">
          {r.batch_number}
        </Link>
      ),
      searchValue: (r) => r.batch_number,
    },
    { header: "MFR", accessor: (r) => r.mfr_definitions?.name ?? "—", searchValue: (r) => r.mfr_definitions?.name ?? "" },
    {
      header: "Status",
      accessor: (r) => {
        const status = resolveDisplayStatus(r.status, latestQc.get(r.id));
        return <Badge status={status}>{status.replace(/_/g, " ")}</Badge>;
      },
    },
    { header: "Target qty", accessor: (r) => `${formatNumber(r.target_qty)} ${r.unit}` },
    { header: "Actual yield %", accessor: (r) => (r.actual_yield_pct != null ? `${formatNumber(r.actual_yield_pct)}%` : "—") },
    { header: "Finish date", accessor: (r) => formatDate(r.finish_date) },
  ];

  return (
    <div>
      <PageHeader
        title="Finished Product"
        description="Production batches built from an approved MFR — recipe scaled to target quantity, RM batches drawn FIFO from QC-Approved stock only."
        action={canCreate ? <LinkButton href="/finished-product/new">New batch</LinkButton> : undefined}
      />
      <Card>
        <DataTable columns={columns} rows={rows} searchPlaceholder="Search batch number or MFR…" emptyLabel="No finished product batches yet." />
      </Card>
    </div>
  );
}

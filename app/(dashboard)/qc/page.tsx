import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber } from "@/lib/utils";

type QcListRow = {
  id: string;
  ar_number: string;
  status: string;
  sample_qty: string | number | null;
  sample_unit: string | null;
  retest_date: string | null;
  items: { item_code: string; name: string } | null;
  purchase_lines: { batch_number: string } | null;
  finished_product_batches: { batch_number: string } | null;
};

export default async function QcListPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("quality_checks")
    .select(
      "id, ar_number, status, sample_qty, sample_unit, retest_date, items(item_code, name), purchase_lines(batch_number), finished_product_batches(batch_number)"
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as QcListRow[];

  const columns: Column<QcListRow>[] = [
    {
      header: "AR Number",
      accessor: (r) => (
        <Link href={`/qc/${r.id}`} className="font-medium text-brand-dark hover:underline">
          {r.ar_number}
        </Link>
      ),
      searchValue: (r) => r.ar_number,
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.status}>{r.status.replace("_", " ")}</Badge>,
      searchValue: (r) => r.status,
    },
    {
      header: "Item",
      accessor: (r) => (r.items ? `${r.items.item_code} — ${r.items.name}` : "—"),
      searchValue: (r) => r.items?.name ?? "",
    },
    {
      header: "Batch",
      accessor: (r) => r.purchase_lines?.batch_number ?? r.finished_product_batches?.batch_number ?? "—",
      searchValue: (r) => r.purchase_lines?.batch_number ?? r.finished_product_batches?.batch_number ?? "",
    },
    {
      header: "Sample qty",
      accessor: (r) => (r.sample_qty !== null ? `${formatNumber(r.sample_qty)} ${r.sample_unit ?? ""}` : "—"),
    },
    { header: "Retest date", accessor: (r) => formatDate(r.retest_date) },
  ];

  return (
    <div>
      <PageHeader
        title="Quality Control"
        description="Assign Records (AR) for incoming batches and the review decision that gates production — DESIGN.md §4.5 / §7.2."
        action={canWrite(user?.roles ?? [], "qc_assign") ? <LinkButton href="/qc/new">New AR</LinkButton> : null}
      />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          emptyLabel="No quality checks yet."
          searchPlaceholder="Search AR number, item, or batch…"
        />
      </Card>
    </div>
  );
}

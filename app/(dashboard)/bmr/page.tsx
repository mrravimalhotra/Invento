import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import Link from "next/link";

type BmrRow = {
  id: string;
  prepared_at: string | null;
  checked_at: string | null;
  approved_at: string | null;
  finished_product_batches: { batch_number: string } | null;
};

function bmrStage(row: BmrRow): { label: string; status: string } {
  if (row.approved_at) return { label: "Approved", status: "approved" };
  if (row.checked_at) return { label: "Checked", status: "submitted" };
  if (row.prepared_at) return { label: "Prepared", status: "submitted" };
  return { label: "Not started", status: "not_submitted" };
}

export default async function BmrListPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("bmr_records")
    .select("id, prepared_at, checked_at, approved_at, finished_product_batches(batch_number)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as BmrRow[];
  const canCreate = canWrite(user?.roles ?? [], "bmr");

  const columns: Column<BmrRow>[] = [
    {
      header: "FP Batch",
      accessor: (r) => (
        <Link href={`/bmr/${r.id}`} className="font-medium text-brand hover:underline">
          {r.finished_product_batches?.batch_number ?? "—"}
        </Link>
      ),
      searchValue: (r) => r.finished_product_batches?.batch_number ?? "",
    },
    {
      header: "Status",
      accessor: (r) => {
        const stage = bmrStage(r);
        return <Badge status={stage.status}>{stage.label}</Badge>;
      },
    },
    {
      header: "",
      accessor: (r) => (
        <Link href={`/bmr/${r.id}`} className="text-sm text-brand hover:underline">
          Open
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Batch Manufacturing Record"
        description="One BMR per finished product batch — weighment lines, in-process observations, and Prepared / Checked / Approved sign-off."
        action={canCreate ? <LinkButton href="/bmr/new">New BMR</LinkButton> : undefined}
      />
      <Card>
        <DataTable columns={columns} rows={rows} searchPlaceholder="Search by FP batch…" emptyLabel="No BMRs yet." />
      </Card>
    </div>
  );
}

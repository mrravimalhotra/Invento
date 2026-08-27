import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber } from "@/lib/utils";
import { PackagingExportButton } from "./packaging-export-button";

type PackagingRow = {
  id: string;
  pack_size: string;
  unit_count: number | string;
  department: string;
  transaction_type: string;
  created_at: string;
  finished_product_batches: { batch_number: string } | null;
  items: { name: string } | null;
};

// transaction_type -> an existing Badge status key so pack/repack/unpack read
// distinctly without adding a new style to components/ui/badge.tsx.
const TXN_BADGE_STATUS: Record<string, string> = { pack: "approved", repack: "submitted", unpack: "rejected" };

export default async function PackagingListPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("packaging_issues")
    .select(
      "id, pack_size, unit_count, department, transaction_type, created_at, finished_product_batches(batch_number), items(name)"
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as PackagingRow[];
  const canCreate = canWrite(user?.roles ?? [], "packaging");

  const columns: Column<PackagingRow>[] = [
    {
      header: "FP Batch",
      accessor: (r) => r.finished_product_batches?.batch_number ?? "—",
      searchValue: (r) => r.finished_product_batches?.batch_number ?? "",
    },
    { header: "Pack size", accessor: (r) => r.pack_size, searchValue: (r) => r.pack_size },
    { header: "Unit count", accessor: (r) => formatNumber(r.unit_count, 0) },
    { header: "Department", accessor: (r) => <Badge status={r.department}>{r.department}</Badge> },
    {
      header: "Type",
      accessor: (r) => <Badge status={TXN_BADGE_STATUS[r.transaction_type] ?? "pending"}>{r.transaction_type}</Badge>,
    },
    {
      header: "Packaging item",
      accessor: (r) => r.items?.name ?? "—",
      searchValue: (r) => r.items?.name ?? "",
    },
    { header: "Date", accessor: (r) => formatDate(r.created_at) },
  ];

  const pdfRows = rows.map((r) => [
    r.finished_product_batches?.batch_number ?? "—",
    r.pack_size,
    formatNumber(r.unit_count, 0),
    r.department,
    r.transaction_type,
    r.items?.name ?? "—",
    formatDate(r.created_at),
  ]);

  return (
    <div>
      <PageHeader
        title="Packaging"
        description="Packing register — issues finished product out to a department against an Approved FP batch. Doubles as the legacy FormPackingList."
        action={
          <div className="flex gap-2">
            <PackagingExportButton rows={pdfRows} />
            {canCreate && <LinkButton href="/packaging/new">New issue</LinkButton>}
          </div>
        }
      />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          searchPlaceholder="Search by FP batch or packaging item…"
          emptyLabel="No packaging issues yet."
        />
      </Card>
    </div>
  );
}

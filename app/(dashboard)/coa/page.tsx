import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";

type CoaRow = {
  id: string;
  coa_number: string;
  issued_at: string;
  file_url: string | null;
  quality_checks: {
    ar_number: string;
    items: { item_code: string; name: string } | null;
    purchase_lines: { batch_number: string } | null;
  } | null;
  finished_product_batches: { batch_number: string } | null;
};

export default async function CoaListPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("coa_records")
    .select(
      "id, coa_number, issued_at, file_url, quality_checks(ar_number, items(item_code, name), purchase_lines(batch_number)), finished_product_batches(batch_number)"
    )
    .order("issued_at", { ascending: false });

  const rows = (data ?? []) as unknown as CoaRow[];

  const columns: Column<CoaRow>[] = [
    {
      header: "COA Number",
      accessor: (r) => <span className="font-medium">{r.coa_number}</span>,
      searchValue: (r) => r.coa_number,
    },
    {
      header: "AR Number",
      accessor: (r) => r.quality_checks?.ar_number ?? "—",
      searchValue: (r) => r.quality_checks?.ar_number ?? "",
    },
    {
      header: "Item",
      accessor: (r) => (r.quality_checks?.items ? `${r.quality_checks.items.item_code} — ${r.quality_checks.items.name}` : "—"),
      searchValue: (r) => r.quality_checks?.items?.name ?? "",
    },
    {
      header: "Batch",
      accessor: (r) => r.quality_checks?.purchase_lines?.batch_number ?? r.finished_product_batches?.batch_number ?? "—",
    },
    { header: "Issued", accessor: (r) => formatDate(r.issued_at) },
    {
      header: "File",
      accessor: (r) =>
        r.file_url ? (
          <a href={r.file_url} target="_blank" rel="noreferrer" className="text-brand-dark hover:underline">
            Link
          </a>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Certificate of Analysis"
        description="Issued COAs, linked to the underlying Approved quality check — DESIGN.md §4.12."
        action={canWrite(user?.roles ?? [], "coa") ? <LinkButton href="/coa/new">New COA</LinkButton> : null}
      />
      <Card>
        <DataTable columns={columns} rows={rows} emptyLabel="No certificates issued yet." searchPlaceholder="Search COA or AR number…" />
      </Card>
    </div>
  );
}

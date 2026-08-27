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

type MfrRow = {
  id: string;
  code: string;
  name: string;
  version: number;
  batch_size_qty: string | number;
  batch_size_unit: string;
  approved_by: string | null;
  approved_at: string | null;
  item_types: { description: string } | null;
};

export default async function MfrListPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("mfr_definitions")
    .select(
      "id, code, name, version, batch_size_qty, batch_size_unit, approved_by, approved_at, item_types(description)"
    )
    .eq("active", true)
    .order("code", { ascending: true });

  const rows = (data ?? []) as unknown as MfrRow[];
  const canCreate = canWrite(user?.roles ?? [], "mfr");

  const columns: Column<MfrRow>[] = [
    {
      header: "Code",
      accessor: (r) => (
        <Link href={`/mfr/${r.id}`} className="font-medium text-brand hover:underline">
          {r.code}
        </Link>
      ),
      searchValue: (r) => r.code,
    },
    { header: "Name", accessor: (r) => r.name, searchValue: (r) => r.name },
    { header: "Version", accessor: (r) => `v${r.version}` },
    { header: "Item type", accessor: (r) => r.item_types?.description ?? "—" },
    { header: "Batch size", accessor: (r) => `${formatNumber(r.batch_size_qty)} ${r.batch_size_unit}` },
    {
      header: "Approval",
      accessor: (r) =>
        r.approved_by ? (
          <Badge status="approved">Approved · {formatDate(r.approved_at)}</Badge>
        ) : (
          <Badge status="not_submitted">Not approved</Badge>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Master Formula Record (MFR)"
        description="Approved recipes for finished products — versioned so a past edit never silently overwrites the record on file."
        action={canCreate ? <LinkButton href="/mfr/new">New MFR</LinkButton> : undefined}
      />
      <Card>
        <DataTable columns={columns} rows={rows} searchPlaceholder="Search MFR code or name…" emptyLabel="No MFR definitions yet." />
      </Card>
    </div>
  );
}

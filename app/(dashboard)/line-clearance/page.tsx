import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";

type LineClearanceRow = {
  id: string;
  area: string;
  batch_reference: string | null;
  status: "clear" | "not_clear";
  checked_at: string;
};

export default async function LineClearancePage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("line_clearance_checks")
    .select("id, area, batch_reference, status, checked_at")
    .order("checked_at", { ascending: false });

  const rows: LineClearanceRow[] = data ?? [];
  const canCreate = canWrite(user?.roles ?? [], "line_clearance");

  const columns: Column<LineClearanceRow>[] = [
    { header: "Area", accessor: (r) => <span className="font-medium">{r.area}</span>, searchValue: (r) => r.area },
    {
      header: "Batch reference",
      accessor: (r) => r.batch_reference || "—",
      searchValue: (r) => r.batch_reference ?? "",
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.status}>{r.status === "clear" ? "Clear" : "Not clear"}</Badge>,
    },
    { header: "Checked at", accessor: (r) => formatDate(r.checked_at) },
  ];

  return (
    <div>
      <PageHeader
        title="Line Clearance"
        description="Before-batch clearance checks for production areas — confirms a line is clean and free of the previous batch before a new one starts."
        action={canCreate ? <LinkButton href="/line-clearance/new">New check</LinkButton> : undefined}
      />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          searchPlaceholder="Search by area or batch reference…"
          emptyLabel="No line clearance checks recorded yet."
        />
      </Card>
    </div>
  );
}

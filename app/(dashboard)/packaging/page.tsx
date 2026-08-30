import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils";
import { PackagingExportButton } from "./packaging-export-button";
import { PackagingTable, type PackagingRow } from "./packaging-table";

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
        <PackagingTable rows={rows} />
      </Card>
    </div>
  );
}

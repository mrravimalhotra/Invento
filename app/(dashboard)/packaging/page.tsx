import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils";
import { materialsSummary, rmFpBatchesText, rmFpItemCodesText } from "@/lib/packaging-materials";
import { PackagingExportButton } from "./packaging-export-button";
import { PackagingTable, type PackagingRow } from "./packaging-table";

export default async function PackagingListPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  // packaging_issue_items (0027_packaging_multi_material.sql, 3 Sept 2026):
  // one issue can now carry several materials (bottles, caps, labels, …),
  // each with its own quantity/unit — embedded here in place of the old
  // singular items(name) FK read off packaging_item_id.
  const { data } = await fetchAllRows((from, to) =>
    supabase
      .from("packaging_issues")
      .select(
        "id, code, pack_size, unit_count, department, created_at, issue_date, finished_product_batches(batch_number), packaging_issue_items(quantity, unit, items(name, item_code)), production_issue_batches(batch_number, quantity, unit, active, items(item_code))"
      )
      .order("issue_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)
  );

  const rows = (data ?? []) as unknown as PackagingRow[];
  const canCreate = canWrite(user?.roles ?? [], "packaging");

  const pdfRows = rows.map((r) => [
    r.code,
    r.finished_product_batches?.batch_number ?? "—",
    r.pack_size,
    formatNumber(r.unit_count, 0),
    r.department,
    materialsSummary(r.packaging_issue_items),
    rmFpItemCodesText(r.production_issue_batches),
    rmFpBatchesText(r.production_issue_batches),
    formatDate(r.issue_date),
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
      {created === "1" && (
        <p className="mb-4 rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
          New packaging issue has been successfully added.
        </p>
      )}
      <Card>
        <PackagingTable rows={rows} />
      </Card>
    </div>
  );
}

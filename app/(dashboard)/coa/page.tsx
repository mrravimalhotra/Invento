import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CoaTable, type CoaRow } from "./coa-table";

export default async function CoaListPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("coa_records")
    .select(
      "id, coa_number, issued_at, file_url, quality_checks(ar_number, items(item_code, name), purchase_lines(batch_number)), finished_product_batches(batch_number)"
    )
    .order("issued_at", { ascending: false });

  const rows = (data ?? []) as unknown as CoaRow[];

  return (
    <div>
      <PageHeader
        title="Certificate of Analysis"
        description="Issued COAs, linked to the underlying Approved quality check — DESIGN.md §4.12."
        action={canWrite(user?.roles ?? [], "coa") ? <LinkButton href="/coa/new">New COA</LinkButton> : null}
      />
      {created === "1" && (
        <p className="mb-4 rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
          New COA has been successfully added.
        </p>
      )}
      <Card>
        <CoaTable rows={rows} />
      </Card>
    </div>
  );
}

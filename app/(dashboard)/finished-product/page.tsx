import { createClient } from "@/lib/supabase/server";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { latestQcByBatch } from "@/lib/finished-product-status";
import { FinishedProductTable, type FpRow } from "./finished-product-table";

type FpQueryRow = {
  id: string;
  batch_number: string;
  short_batch_no: string | null;
  is_legacy: boolean;
  target_qty: string | number;
  unit: string;
  actual_yield_pct: string | number | null;
  finish_date: string | null;
  status: string;
  mfr_definitions: { name: string } | null;
};

export default async function FinishedProductListPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);

  // Lazy 30-minute draft auto-expiry — see the detail page's own comment
  // (0046_fp_batch_draft_cancel.sql) for why this is a lazy, page-load
  // check rather than a real scheduled job. Run alongside the main select
  // rather than awaited on its own beforehand (21 Sept 2026 — was a fully
  // serial round trip before this page's real data query even started, on
  // every single visit to this page). Running them in parallel means a
  // batch that crosses the 30-minute mark in the split second between the
  // two queries starting could show as "draft" for one more page load
  // before showing "cancelled" — an acceptable, self-correcting tradeoff
  // for a lazy background cleanup, not a correctness issue for anything
  // else on this page.
  const [, { data }] = await Promise.all([
    supabase.rpc("expire_stale_fp_drafts"),
    fetchAllRows((from, to) =>
      supabase
        .from("finished_product_batches")
        .select(
          "id, batch_number, short_batch_no, is_legacy, target_qty, unit, actual_yield_pct, finish_date, status, mfr_definitions(name)",
        )
        .eq("active", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const fpRows = (data ?? []) as unknown as FpQueryRow[];

  // ACC-08: looked up in chunks — one .in() with every batch id is too long
  // a URL once there are many batches.
  const { data: qcRows } = await fetchByIdChunks(
    fpRows.map((r) => r.id),
    (chunk) =>
      supabase
        .from("quality_checks")
        .select("finished_product_batch_id, status, created_at")
        .in("finished_product_batch_id", chunk)
        .not("finished_product_batch_id", "is", null)
  );

  const latestQc = latestQcByBatch((qcRows ?? []) as { finished_product_batch_id: string; status: string; created_at: string }[]);
  const rows: FpRow[] = fpRows.map((r) => ({ ...r, latestQcStatus: latestQc.get(r.id)?.status }));
  const canCreate = canWrite(user?.roles ?? [], "finished_product");

  return (
    <div>
      <PageHeader
        title="Finished Product"
        description="Production batches built from an approved MFR — recipe scaled to target quantity, RM batches drawn FIFO from QC-Approved stock only."
        action={canCreate ? <LinkButton href="/finished-product/new">New batch</LinkButton> : undefined}
      />
      <Card>
        <FinishedProductTable rows={rows} />
      </Card>
    </div>
  );
}

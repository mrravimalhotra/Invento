import type { SupabaseClient } from "@supabase/supabase-js";

// Shared server-side enrichment for raw inventory_ledger rows, factored
// out of the Ledger tab's page.tsx during Phase 4 (Inventory Ledger
// redesign, claude/inventory-ledger-redesign.md) so the new per-item
// detail page's embedded ledger can reuse the exact same logic rather
// than drifting out of sync with a second copy.
//
// Two things every ledger listing in this app needs, neither available
// as a plain PostgREST embed:
// 1. `event_by` display name — references auth.users, not profiles
//    directly, so there's no FK to embed through.
// 2. FB-0013 Finished Product batch context — see the inline comment
//    below, unchanged reasoning from Phase 1/Phase 3.
export type RawLedgerRow = {
  id: string;
  event_at: string;
  event_type: string;
  quantity: string | number;
  unit: string | null;
  department: string | null;
  reference_type: string | null;
  reference_id: string | null;
  event_by: string | null;
  items: { name: string; item_code: string } | null;
  purchase_lines: { batch_number: string } | null;
  running_balance?: string | number | null;
};

export type EnrichedLedgerRow = RawLedgerRow & {
  eventByName: string | null;
  // FB-0013 ("Batch should be visible in inventory ledger") — the Finished
  // Product batch a 'finished_product'/'packaging' event relates to,
  // resolved server-side via reference_id (see below). Distinct from
  // purchase_lines.batch_number on RawLedgerRow, which is the
  // raw-material batch.
  fpBatchNumber: string | null;
};

export async function enrichLedgerRows<T extends RawLedgerRow>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  ledgerRows: T[]
): Promise<(T & { eventByName: string | null; fpBatchNumber: string | null })[]> {
  const userIds = Array.from(new Set(ledgerRows.map((r) => r.event_by).filter((v): v is string => !!v)));
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    (profiles ?? []).forEach((p: { id: string; full_name: string | null }) => {
      if (p.full_name) nameById.set(p.id, p.full_name);
    });
  }

  // FB-0013 ("Batch should be visible in inventory ledger"): purchase_lines
  // above only covers raw-material batches. A 'finished_product' pull (MFR
  // component consumption) or a 'packaging' pull has no purchase_line_id
  // at all — its batch context is the *Finished Product* batch instead,
  // reachable only via the untyped reference_id column (no real FK
  // PostgREST can embed — see known-issues.md). Resolve it with two more
  // targeted lookups rather than a schema change: 'finished_product' rows
  // point straight at finished_product_batches.id; 'packaging' rows point
  // at packaging_issues.id, one hop further to the batch.
  //
  // Phase 3 (0030_finished_product_ledger.sql) adds a fourth source of FP
  // batch context: 'fp_yield' rows (the batch's own output push) always
  // point straight at finished_product_batches.id, same shape as
  // 'finished_product'. qc_sample/stability_sample/rnd_sample are trickier
  // — Phase 1 already uses those same reference_type values for
  // purchase-line-context pulls (reference_id there is a purchase_line
  // id), so a bare reference_type check can't tell the two apart. The real
  // purchase_line_id column (embedded as purchase_lines) is what
  // distinguishes them: Phase 3's trigger never sets it, so an FP-context
  // sample row always has purchase_lines === null while an RM-context one
  // always has it populated.
  const fpBatchByLedgerId = new Map<string, string>();
  const fpDirectIds = ledgerRows
    .filter(
      (r) =>
        r.reference_id &&
        (r.reference_type === "finished_product" ||
          r.reference_type === "fp_yield" ||
          ((r.reference_type === "qc_sample" || r.reference_type === "stability_sample" || r.reference_type === "rnd_sample") &&
            !r.purchase_lines))
    )
    .map((r) => r.reference_id as string);
  const packagingIds = ledgerRows
    .filter((r) => r.reference_type === "packaging" && r.reference_id)
    .map((r) => r.reference_id as string);

  const [fpDirect, fpViaPackaging] = await Promise.all([
    fpDirectIds.length > 0
      ? supabase.from("finished_product_batches").select("id, batch_number").in("id", fpDirectIds)
      : Promise.resolve({ data: [] }),
    packagingIds.length > 0
      ? supabase.from("packaging_issues").select("id, finished_product_batches(batch_number)").in("id", packagingIds)
      : Promise.resolve({ data: [] }),
  ]);
  (fpDirect.data ?? []).forEach((b: { id: string; batch_number: string }) => {
    fpBatchByLedgerId.set(b.id, b.batch_number);
  });
  (fpViaPackaging.data ?? []).forEach((p) => {
    const row = p as unknown as { id: string; finished_product_batches: { batch_number: string } | null };
    if (row.finished_product_batches) fpBatchByLedgerId.set(row.id, row.finished_product_batches.batch_number);
  });

  return ledgerRows.map((r) => ({
    ...r,
    eventByName: r.event_by ? nameById.get(r.event_by) ?? r.event_by.slice(0, 8) : null,
    fpBatchNumber: r.reference_id ? fpBatchByLedgerId.get(r.reference_id) ?? null : null,
  }));
}

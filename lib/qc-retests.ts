import type { SupabaseClient } from "@supabase/supabase-js";

// Retests a raw-material batch has had so far: the retest records made in the
// app plus the retests already done before it was loaded as opening stock
// (quality_checks.legacy_retests_done, migration 0100). Both count toward the
// limit of 3 (FB-0061).
export async function countRetestsDone(
  supabase: SupabaseClient,
  batch: { purchaseLineId?: string | null; productionBatchId?: string | null }
): Promise<number> {
  const col = batch.purchaseLineId ? "purchase_line_id" : "production_batch_id";
  const id = (batch.purchaseLineId ?? batch.productionBatchId) as string | null | undefined;
  if (!id) return 0;
  const [{ count }, { data: legacy }] = await Promise.all([
    supabase.from("quality_checks").select("id", { count: "exact", head: true }).eq(col, id).eq("is_retest", true),
    supabase.from("quality_checks").select("legacy_retests_done").eq(col, id).eq("is_legacy", true),
  ]);
  const before = (legacy ?? []).reduce((n, q) => n + (q.legacy_retests_done ?? 0), 0);
  return (count ?? 0) + before;
}

import type { createClient } from "@/lib/supabase/server";

// B34 / FB-0049 / FB-0056 (Ravi, 10 Oct 2026): QC is told when a finished
// product batch has started, not only when it is complete. "Started" is the
// moment the draft is turned into a real batch (status 'in_process'); the batch
// stays in this list until it is completed (then it moves to "Finished Product
// Awaiting QC"), so QC can plan in-process testing. Read straight from
// finished_product_batches.status: nothing is stored for the alert.

export type FpInProgressRow = {
  id: string;
  batch_number: string;
  short_batch_no: string | null;
  target_qty: string | number;
  unit: string;
  batch_start_date: string | null;
  created_at: string;
  is_legacy: boolean;
  mfr_definitions: { name: string } | null;
};

// Newest first; capped so a long backlog of old unfinished batches cannot
// slow a page (the total is returned too, for a "+ N more" line).
const LIMIT = 50;

export async function getFpInProgress(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ rows: FpInProgressRow[]; total: number }> {
  const { data, count } = await supabase
    .from("finished_product_batches")
    .select("id, batch_number, short_batch_no, target_qty, unit, batch_start_date, created_at, is_legacy, mfr_definitions(name)", {
      count: "exact",
    })
    .eq("status", "in_process")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(LIMIT);
  return { rows: (data ?? []) as unknown as FpInProgressRow[], total: count ?? (data ?? []).length };
}

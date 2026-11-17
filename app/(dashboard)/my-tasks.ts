import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Role } from "@/lib/constants/roles";
import { tasksFor, type TaskKey } from "@/lib/my-tasks";
import { isLegacyCode } from "@/lib/utils";

/** A task's count with and without legacy (LEG-) records; the browser picks one by "Hide legacy data". */
export type TaskCount = { all: number; nonLegacy: number };

// UX-04: the counts behind the Dashboard's "My tasks" card, read only for the tasks this
// user sees. A count that fails to load is left out of the card rather than shown as 0.
// 17 Nov 2026: each count is a pair, like the rest of the Dashboard (ACC-26), so "Hide
// legacy data" applies here too; a record is legacy by the QC list's rule (item code or
// batch number starts LEG-). Stale drafts are cancelled first, as the Finished Product
// pages do, so a draft past its 30 minutes is not counted.
export async function getMyTaskCounts(
  supabase: SupabaseClient,
  roles: readonly Role[],
  userId: string | null
): Promise<Partial<Record<TaskKey, TaskCount>>> {
  const wanted = new Set(tasksFor(roles).map((t) => t.key));
  const counts: Partial<Record<TaskKey, TaskCount>> = {};
  const tally = (legacy: boolean[]): TaskCount => ({ all: legacy.length, nonLegacy: legacy.filter((l) => !l).length });
  const jobs: Promise<void>[] = [];
  const add = (keys: TaskKey[], job: () => Promise<void>) => {
    if (keys.some((k) => wanted.has(k))) jobs.push(job());
  };

  add(["qc_round1", "qc_round2"], async () => {
    type Row = {
      status: string;
      checker_by: string | null;
      items: { item_code: string } | null;
      purchase_lines: { batch_number: string } | null;
      finished_product_batches: { batch_number: string } | null;
      production_issue_batches: { batch_number: string } | null;
    };
    const res = await fetchAllRows<Row>((from, to) =>
      supabase
        .from("quality_checks")
        .select("status, checker_by, items(item_code), purchase_lines(batch_number), finished_product_batches(batch_number), production_issue_batches(batch_number)")
        .in("status", ["submitted", "checker_approved", "checker_rejected"])
        .order("id")
        .range(from, to)
        .returns<Row[]>()
    );
    if (res.error) return;
    const legacy = (r: Row) =>
      isLegacyCode(r.items?.item_code) ||
      isLegacyCode(r.purchase_lines?.batch_number) ||
      isLegacyCode(r.finished_product_batches?.batch_number) ||
      isLegacyCode(r.production_issue_batches?.batch_number);
    counts.qc_round1 = tally(res.data.filter((r) => r.status === "submitted").map(legacy));
    // Round 2 must be a different person from Round 1, so the reviewer's own Round 1 decisions are not theirs to finish.
    counts.qc_round2 = tally(
      res.data.filter((r) => r.status !== "submitted" && (!userId || r.checker_by !== userId)).map(legacy)
    );
  });

  add(["fp_draft", "fp_in_process", "fp_complete"], async () => {
    await supabase.rpc("expire_stale_fp_drafts");
    const res = await fetchAllRows<{ status: string; batch_number: string }>((from, to) =>
      supabase
        .from("finished_product_batches")
        .select("status, batch_number")
        .eq("active", true)
        .in("status", ["draft", "in_process", "complete_awaiting_qc"])
        .order("id")
        .range(from, to)
    );
    if (res.error) return;
    const by = (s: string) => tally(res.data.filter((b) => b.status === s).map((b) => isLegacyCode(b.batch_number)));
    counts.fp_draft = by("draft");
    counts.fp_in_process = by("in_process");
    counts.fp_complete = by("complete_awaiting_qc");
  });

  add(["po_draft"], async () => {
    const res = await fetchAllRows<{ po_number: string }>((from, to) =>
      supabase.from("purchase_orders").select("po_number").eq("active", true).eq("status", "draft").order("id").range(from, to)
    );
    if (!res.error) counts.po_draft = tally(res.data.map((p) => isLegacyCode(p.po_number)));
  });

  add(["fp_unpacked"], async () => {
    const [approved, issues] = await Promise.all([
      fetchAllRows<{ id: string; batch_number: string }>((from, to) =>
        supabase.from("finished_product_batches").select("id, batch_number").eq("active", true).eq("status", "approved").order("id").range(from, to)
      ),
      fetchAllRows<{ finished_product_batch_id: string }>((from, to) =>
        supabase.from("packaging_issues").select("finished_product_batch_id").is("voided_at", null).order("id").range(from, to)
      ),
    ]);
    if (approved.error || issues.error) return;
    const packed = new Set(issues.data.map((r) => r.finished_product_batch_id));
    counts.fp_unpacked = tally(approved.data.filter((b) => !packed.has(b.id)).map((b) => isLegacyCode(b.batch_number)));
  });

  await Promise.all(jobs);
  return counts;
}

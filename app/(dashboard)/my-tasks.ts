import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Role } from "@/lib/constants/roles";
import { tasksFor, type TaskKey } from "@/lib/my-tasks";

// UX-04: the counts behind the Dashboard's "My tasks" card, read only for the tasks this
// user sees. A count that fails to load is left out of the card rather than shown as 0.
export async function getMyTaskCounts(
  supabase: SupabaseClient,
  roles: readonly Role[],
  userId: string | null
): Promise<Partial<Record<TaskKey, number>>> {
  const wanted = new Set(tasksFor(roles).map((t) => t.key));
  const head = { count: "exact" as const, head: true };
  const counts: Partial<Record<TaskKey, number>> = {};
  const jobs: Promise<void>[] = [];
  const count = (key: TaskKey, q: PromiseLike<{ count: number | null; error: unknown }>) => {
    if (!wanted.has(key)) return;
    jobs.push(
      Promise.resolve(q).then(({ count: n, error }) => {
        if (!error && n !== null) counts[key] = n;
      })
    );
  };

  count("qc_round1", supabase.from("quality_checks").select("*", head).eq("status", "submitted"));
  // Round 2 must be a different person from Round 1, so the reviewer's own Round 1 decisions are not theirs to finish.
  let round2 = supabase.from("quality_checks").select("*", head).in("status", ["checker_approved", "checker_rejected"]);
  if (userId) round2 = round2.or(`checker_by.is.null,checker_by.neq.${userId}`);
  count("qc_round2", round2);
  const fp = (status: string) =>
    supabase.from("finished_product_batches").select("*", head).eq("active", true).eq("status", status);
  count("fp_draft", fp("draft"));
  count("fp_in_process", fp("in_process"));
  count("fp_complete", fp("complete_awaiting_qc"));
  count("po_draft", supabase.from("purchase_orders").select("*", head).eq("active", true).eq("status", "draft"));

  if (wanted.has("fp_unpacked")) {
    jobs.push(
      Promise.all([
        fetchAllRows<{ id: string }>((from, to) =>
          supabase.from("finished_product_batches").select("id").eq("active", true).eq("status", "approved").order("id").range(from, to)
        ),
        fetchAllRows<{ finished_product_batch_id: string }>((from, to) =>
          supabase.from("packaging_issues").select("finished_product_batch_id").order("id").range(from, to)
        ),
      ]).then(([approved, issues]) => {
        if (approved.error || issues.error) return;
        const packed = new Set(issues.data.map((r) => r.finished_product_batch_id));
        counts.fp_unpacked = approved.data.filter((b) => !packed.has(b.id)).length;
      })
    );
  }

  await Promise.all(jobs);
  return counts;
}

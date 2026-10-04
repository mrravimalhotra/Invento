import type { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// Opening stock (0100): the purchase_line_qc view carries no legacy flag, so
// lists built on it look up the (few) opening-stock purchase lines once and
// match them by id.
export async function getOpeningLineIds(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Set<string>> {
  const { data } = await fetchAllRows<{ id: string }>((from, to) =>
    supabase
      .from("purchase_lines")
      .select("id")
      .eq("is_legacy", true)
      .order("id", { ascending: true })
      .range(from, to)
      .returns<{ id: string }[]>()
  );
  return new Set(data.map((r) => r.id));
}

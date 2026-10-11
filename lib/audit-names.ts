import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchByIdChunks } from "@/lib/supabase/fetch-all";
import type { AuditNameMap } from "@/app/(dashboard)/audit/audit-diff";

// SCAN-P8-12: the Audit Log stores ids (person, item, vendor, batch …). This looks the ids that
// appear in a set of audit rows up, once per kind, so the screen and the Excel file can show
// names instead. Read-only; an id that is not found simply stays as it is.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Kind = "profile" | "item" | "vendor" | "purchase_line" | "fp_batch" | "mfr" | "item_type";

function kindOf(key: string): Kind | null {
  if (key === "item_id") return "item";
  if (key === "vendor_id") return "vendor";
  if (key === "purchase_line_id") return "purchase_line";
  if (key === "finished_product_batch_id") return "fp_batch";
  if (key === "mfr_definition_id") return "mfr";
  if (key === "item_type_id") return "item_type";
  if (key.endsWith("_by") || key === "user_id" || key === "profile_id") return "profile";
  return null;
}

type AuditData = { old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; changed_by?: string | null };

export async function resolveAuditNames(supabase: SupabaseClient, rows: AuditData[]): Promise<AuditNameMap> {
  const ids: Record<Kind, Set<string>> = {
    profile: new Set(), item: new Set(), vendor: new Set(), purchase_line: new Set(),
    fp_batch: new Set(), mfr: new Set(), item_type: new Set(),
  };
  for (const r of rows) {
    if (r.changed_by) ids.profile.add(r.changed_by);
    for (const data of [r.old_data, r.new_data]) {
      if (!data) continue;
      for (const [key, v] of Object.entries(data)) {
        if (typeof v !== "string" || !UUID.test(v)) continue;
        const kind = kindOf(key);
        if (kind) ids[kind].add(v);
      }
    }
  }

  const names: AuditNameMap = {};
  const put = (id: string, label: string | null | undefined) => {
    if (label) names[id] = label;
  };
  const both = (a?: string | null, b?: string | null) => [a, b].filter(Boolean).join(" · ");

  await Promise.all([
    fetchByIdChunks<{ id: string; full_name: string | null }>([...ids.profile], (c) =>
      supabase.from("profiles").select("id, full_name").in("id", c)
    ).then((r) => r.data.forEach((x) => put(x.id, x.full_name))),
    fetchByIdChunks<{ id: string; item_code: string | null; name: string | null }>([...ids.item], (c) =>
      supabase.from("items").select("id, item_code, name").in("id", c)
    ).then((r) => r.data.forEach((x) => put(x.id, both(x.item_code, x.name)))),
    fetchByIdChunks<{ id: string; vendor_code: string | null; name: string | null }>([...ids.vendor], (c) =>
      supabase.from("vendors").select("id, vendor_code, name").in("id", c)
    ).then((r) => r.data.forEach((x) => put(x.id, both(x.vendor_code, x.name)))),
    fetchByIdChunks<{ id: string; batch_number: string | null }>([...ids.purchase_line], (c) =>
      supabase.from("purchase_lines").select("id, batch_number").in("id", c)
    ).then((r) => r.data.forEach((x) => put(x.id, x.batch_number ? `Batch ${x.batch_number}` : null))),
    fetchByIdChunks<{ id: string; batch_number: string | null }>([...ids.fp_batch], (c) =>
      supabase.from("finished_product_batches").select("id, batch_number").in("id", c)
    ).then((r) => r.data.forEach((x) => put(x.id, x.batch_number ? `Batch ${x.batch_number}` : null))),
    fetchByIdChunks<{ id: string; code: string | null; name: string | null }>([...ids.mfr], (c) =>
      supabase.from("mfr_definitions").select("id, code, name").in("id", c)
    ).then((r) => r.data.forEach((x) => put(x.id, both(x.code, x.name)))),
    fetchByIdChunks<{ id: string; name: string | null }>([...ids.item_type], (c) =>
      supabase.from("item_types").select("id, name").in("id", c)
    ).then((r) => r.data.forEach((x) => put(x.id, x.name))),
  ]);
  return names;
}

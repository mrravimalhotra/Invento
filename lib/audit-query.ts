import type { SupabaseClient } from "@supabase/supabase-js";
import { istDayStart, istDayEnd } from "@/lib/utils";

// SCAN-P1-15: one definition of the Audit Log filters, used by the page (one page at a time)
// and by the "download all matching" action.

export type AuditFilter = { table: string; from: string; to: string; user: string; action: string; record: string };

export const AUDIT_PAGE_SIZE = 200;
export const AUDIT_EXPORT_LIMIT = 10000;
export const AUDIT_COLUMNS = "id, table_name, row_id, action, old_data, new_data, changed_by, changed_at, changed_via";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string | undefined): s is string => !!s && UUID.test(s);

// The fields that name a record on its own pages (same list the Record column uses).
const RECORD_FIELDS = [
  "ar_number", "po_number", "batch_number", "coa_number", "code", "item_code", "vendor_code",
  "equipment_code", "asset_code", "ticket_number", "email", "full_name", "description", "title",
  "article_name", "name",
];

// Text typed in the Record box: removes the characters that mean something inside a filter
// expression.
export function cleanRecordText(s: string): string {
  return s.replace(/[,()"%*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function auditQuery(supabase: SupabaseClient, f: AuditFilter, withCount: boolean) {
  let q = supabase
    .from("audit_log")
    .select(AUDIT_COLUMNS, withCount ? { count: "exact" } : undefined)
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false });
  if (f.table) q = q.eq("table_name", f.table);
  if (f.action) q = q.eq("action", f.action);
  if (isUuid(f.user)) q = q.eq("changed_by", f.user);
  if (f.from) q = q.gte("changed_at", istDayStart(f.from));
  if (f.to) q = q.lte("changed_at", istDayEnd(f.to));
  const text = cleanRecordText(f.record);
  if (text) {
    if (isUuid(text)) {
      q = q.eq("row_id", text);
    } else {
      const conds = RECORD_FIELDS.flatMap((k) => [`new_data->>${k}.ilike.*${text}*`, `old_data->>${k}.ilike.*${text}*`]);
      q = q.or(conds.join(","));
    }
  }
  return q;
}

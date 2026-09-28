// Plain data helpers shared between the list page's filters/table
// (audit-filters.tsx / audit-table.tsx, both client components) and the
// detail page (a server component) — kept in their own module, with no
// "use client" of its own, so either side can import them as ordinary
// values/functions. AUDIT_TABLE_OPTIONS in particular has to live here
// rather than in audit-filters.tsx: importing a plain array export from a
// "use client" module into a Server Component resolves to a client
// reference proxy at build time, not the real value (confirmed by
// `next build` failing on exactly that — "AUDIT_TABLE_OPTIONS.map is not
// a function" — when the detail page imported it from audit-filters.tsx).
export const AUDIT_TABLE_OPTIONS: { value: string; label: string }[] = [
  // Every audited table (0072_complete_audit_trail.sql), grouped roughly by
  // module. The first four were the only ones audited before 0072.
  { value: "quality_checks", label: "QC Decision" },
  { value: "finished_product_batches", label: "Finished Product Batch" },
  { value: "purchase_orders", label: "Purchase Order" },
  { value: "mfr_definitions", label: "MFR Definition" },
  { value: "purchase_lines", label: "Purchase Line (Batch)" },
  { value: "mfr_lines", label: "MFR Recipe Line" },
  { value: "mfr_procedure_steps", label: "MFR Procedure Step" },
  { value: "finished_product_components", label: "FP Batch Component" },
  { value: "packaging_issues", label: "Packaging Issue" },
  { value: "packaging_issue_items", label: "Packaging Issue Material" },
  { value: "production_issue_batches", label: "Production Batch (PROD)" },
  { value: "inventory_ledger", label: "Inventory Ledger (corrections)" },
  { value: "items", label: "Item Master" },
  { value: "item_types", label: "Item Type" },
  { value: "vendors", label: "Vendor" },
  { value: "coa_records", label: "Certificate of Analysis" },
  { value: "coa_templates", label: "COA Template" },
  { value: "coa_template_lines", label: "COA Template Line" },
  { value: "bmr_records", label: "BMR Record" },
  { value: "bmr_weighment_lines", label: "BMR Weighment Line" },
  { value: "bmr_observations", label: "BMR Observation" },
  { value: "line_clearance_checks", label: "Line Clearance" },
  { value: "environmental_control_readings", label: "Environmental Reading" },
  { value: "equipment", label: "Equipment" },
  { value: "dead_stock_items", label: "Dead Stock" },
  { value: "documents", label: "Document" },
  { value: "user_roles", label: "User Role" },
  { value: "auth.users", label: "User Account" },
  { value: "profiles", label: "User Profile" },
  { value: "page_feedback", label: "Tester Feedback" },
];

// How a change reached the database (audit_log.changed_via, 0072). Rows
// recorded before 0072 have no value.
const CHANGED_VIA_LABELS: Record<string, string> = {
  app: "App",
  server: "App server",
  "auth service": "Supabase Auth",
  database: "Database (SQL editor)",
};

export function changedViaLabel(v: string | null | undefined): string {
  return v ? (CHANGED_VIA_LABELS[v] ?? v) : "—";
}

// "Changed By" column: the person when known, otherwise where the change
// came from (e.g. a direct fix in the SQL editor has no signed-in user).
export function changedByLabel(row: Pick<AuditLogRow, "changed_by_name" | "changed_via">): string {
  if (row.changed_by_name) return row.changed_by_name;
  return row.changed_via ? changedViaLabel(row.changed_via) : "—";
}

const ACCOUNT_EVENT_LABELS: Record<string, string> = {
  account_created_by_admin: "Account created by System Admin",
  password_reset_by_admin: "Password reset by System Admin",
  password_changed_by_user: "Password changed by the user",
};

export type AuditLogRow = {
  id: string;
  table_name: string;
  row_id: string;
  action: "insert" | "update" | "delete" | "truncate";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
  changed_via: string | null;
  changed_by_name: string | null;
};

const TABLE_LABELS = Object.fromEntries(AUDIT_TABLE_OPTIONS.map((o) => [o.value, o.label]));

export function tableLabel(tableName: string) {
  return TABLE_LABELS[tableName] ?? tableName;
}

// The row's own data, whichever side of the change has it (delete rows
// have no new_data) — used both for the record label below and by the
// detail page's diff.
export function currentData(row: Pick<AuditLogRow, "old_data" | "new_data">) {
  return row.new_data ?? row.old_data ?? {};
}

// A human-recognizable label for the changed record — the field that
// identifies it on its own module's pages (AR number, batch number, PO
// number, item code, …). Checked in this order across every audited table;
// falls back to the raw row id.
const LABEL_FIELDS = [
  "ar_number", "po_number", "batch_number", "coa_number", "code", "item_code", "vendor_code",
  "equipment_code", "asset_code", "ticket_number", "email", "full_name", "description", "title",
  "article_name", "name", "area", "step_label", "role", "stage", "test",
];

export function recordLabel(row: Pick<AuditLogRow, "table_name" | "row_id" | "old_data" | "new_data" | "action">) {
  if (row.action === "truncate") return "All rows";
  const data = currentData(row);
  for (const field of LABEL_FIELDS) {
    const v = data[field];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return row.row_id;
}

// Every key present in either snapshot whose value actually differs.
// JSON.stringify comparison catches nested-object/array fields (there are
// none among these four tables today, but this doesn't assume that stays
// true), sorted with "status" first since that's the field this feature
// exists to track.
export function diffFields(row: Pick<AuditLogRow, "old_data" | "new_data">): {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}[] {
  const oldData = row.old_data ?? {};
  const newData = row.new_data ?? {};
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changed = [...keys].filter((key) => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]));
  changed.sort((a, b) => (a === "status" ? -1 : b === "status" ? 1 : a.localeCompare(b)));
  return changed.map((key) => ({ key, oldValue: oldData[key], newValue: newData[key] }));
}

// What changed, at a glance — one line for the list page's "What changed"
// column. "status" is called out by name first; everything else just adds
// to the count so the summary stays one line.
export function summarizeChange(row: Pick<AuditLogRow, "action" | "old_data" | "new_data">): string {
  const event = row.new_data?.event;
  if (typeof event === "string" && ACCOUNT_EVENT_LABELS[event]) return ACCOUNT_EVENT_LABELS[event];
  if (row.action === "truncate") return "Table emptied (all rows removed)";
  if (row.action === "insert") return "Record created";
  if (row.action === "delete") return "Record deleted";
  if (row.new_data?.password_changed === true) return "Password changed";

  const changed = diffFields(row);
  if (changed.length === 0) return "No field changes";

  const statusChange = changed.find((c) => c.key === "status");
  if (statusChange) {
    const rest = changed.length - 1;
    const statusPart = `status: ${String(statusChange.oldValue ?? "—")} → ${String(statusChange.newValue ?? "—")}`;
    return rest > 0 ? `${statusPart} (+${rest} more field${rest === 1 ? "" : "s"})` : statusPart;
  }
  return `${changed.length} field${changed.length === 1 ? "" : "s"} changed`;
}

export function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

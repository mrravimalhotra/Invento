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
  // SCAN-P1-15: audited since 0096 / 0100 / 0102 but missing from this filter.
  { value: "company_settings", label: "Company Details & Settings" },
  { value: "opening_loads", label: "Opening Stock Load" },
  { value: "opening_stock_settings", label: "Opening Stock Open / Closed" },
  { value: "coa_template_revisions", label: "COA Template Revision" },
];

export const AUDIT_ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "insert", label: "Created" },
  { value: "update", label: "Edited" },
  { value: "delete", label: "Deleted" },
  { value: "truncate", label: "Table emptied" },
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
  account_disabled_by_admin: "Account disabled by System Admin",
  account_enabled_by_admin: "Account re-enabled by System Admin",
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
  // SCAN-P8-12: plain-words text of the changed fields (names instead of ids), added by the
  // server for the Excel Before / After columns.
  before_text?: string;
  after_text?: string;
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
  // Supabase Auth's own record of a disable/re-enable (the ban date moving).
  if (row.old_data && row.new_data && "banned_until" in row.new_data &&
      JSON.stringify(row.old_data.banned_until) !== JSON.stringify(row.new_data.banned_until)) {
    return row.new_data.banned_until ? "Account disabled (sign-in blocked)" : "Account re-enabled";
  }

  const changed = diffFields(row);
  if (changed.length === 0) return "No field changes";

  const statusChange = changed.find((c) => c.key === "status");
  if (statusChange) {
    const rest = changed.length - 1;
    const statusPart = `status: ${String(statusChange.oldValue ?? "—")} → ${String(statusChange.newValue ?? "—")}`;
    return rest > 0 ? `${statusPart} (+${rest} more field${rest === 1 ? "" : "s"})` : statusPart;
  }
  return namedFields(changed);
}

// SCAN-P8-12: name the changed fields instead of only counting them. The two
// stamps the database adds on every update (updated_at, updated_by) are left
// out unless they are all that changed, so the useful fields come first.
const STAMP_FIELDS = new Set(["updated_at", "updated_by"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function fieldLabel(key: string): string {
  return key.replace(/_id$/, "").replace(/_/g, " ");
}

function shortValue(v: unknown): string | null {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return null;
  const text = String(v);
  if (UUID_PATTERN.test(text) || text.length > 20) return null;
  return text;
}

export function namedFields(changed: { key: string; oldValue: unknown; newValue: unknown }[]): string {
  const meaningful = changed.filter((c) => !STAMP_FIELDS.has(c.key));
  const list = meaningful.length > 0 ? meaningful : changed;
  const parts = list.slice(0, 3).map((c) => {
    const before = shortValue(c.oldValue);
    const after = shortValue(c.newValue);
    return before !== null && after !== null ? `${fieldLabel(c.key)} ${before} → ${after}` : fieldLabel(c.key);
  });
  const rest = list.length - parts.length;
  return rest > 0 ? `${parts.join(", ")} (+${rest} more)` : parts.join(", ");
}

// SCAN-P8-12: field name in words ("Item", "Batch number") for the detail page and Excel.
export function friendlyFieldName(key: string): string {
  const text = fieldLabel(key);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// id (uuid) -> name, built on the server by lib/audit-names.ts.
export type AuditNameMap = Record<string, string>;

export function readableValue(v: unknown, names: AuditNameMap): string {
  if (typeof v === "string" && UUID_PATTERN.test(v)) return names[v] ?? v;
  return displayValue(v);
}

const MAX_TEXT_FIELDS = 25;

// "Before" and "After" cells for the Excel file: only the fields that changed for an edit,
// every field for a created or deleted record, with names instead of ids.
export function beforeAfterText(
  row: Pick<AuditLogRow, "action" | "old_data" | "new_data">,
  names: AuditNameMap
): { before: string; after: string } {
  if (row.action === "truncate") return { before: "", after: "" };
  const part = (key: string, v: unknown) => `${friendlyFieldName(key)}: ${readableValue(v, names)}`;
  if (row.action === "update") {
    const changed = diffFields(row);
    const meaningful = changed.filter((c) => !STAMP_FIELDS.has(c.key));
    const list = (meaningful.length > 0 ? meaningful : changed).slice(0, MAX_TEXT_FIELDS);
    return {
      before: list.map((c) => part(c.key, c.oldValue)).join("; "),
      after: list.map((c) => part(c.key, c.newValue)).join("; "),
    };
  }
  const data = (row.action === "insert" ? row.new_data : row.old_data) ?? {};
  const entries = Object.entries(data)
    .filter(([k, v]) => k !== "id" && !STAMP_FIELDS.has(k) && v !== null && v !== undefined && v !== "")
    .slice(0, MAX_TEXT_FIELDS)
    .map(([k, v]) => part(k, v));
  const text = entries.join("; ");
  return row.action === "insert" ? { before: "", after: text } : { before: text, after: "" };
}

export function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

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
  { value: "quality_checks", label: "QC Decision" },
  { value: "finished_product_batches", label: "Finished Product Batch" },
  { value: "purchase_orders", label: "Purchase Order" },
  { value: "mfr_definitions", label: "MFR Definition" },
];

export type AuditLogRow = {
  id: string;
  table_name: string;
  row_id: string;
  action: "insert" | "update" | "delete";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
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
// number, MFR code) — falls back to the raw row id if the table isn't one
// of the four this migration covers, or the field is somehow missing.
export function recordLabel(row: Pick<AuditLogRow, "table_name" | "row_id" | "old_data" | "new_data">) {
  const data = currentData(row);
  const byTable: Record<string, string | undefined> = {
    quality_checks: (data.ar_number as string) ?? undefined,
    finished_product_batches: (data.batch_number as string) ?? undefined,
    purchase_orders: (data.po_number as string) ?? undefined,
    mfr_definitions: (data.code as string) ?? undefined,
  };
  return byTable[row.table_name] ?? row.row_id;
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
  if (row.action === "insert") return "Record created";
  if (row.action === "delete") return "Record deleted";

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

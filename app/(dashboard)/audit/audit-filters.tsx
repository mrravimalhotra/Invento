"use client";

import Link from "next/link";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { AUDIT_TABLE_OPTIONS } from "./audit-diff";

// Same server-side "GET form, submit on change" pattern as the Inventory
// Ledger's LedgerFilters (app/(dashboard)/inventory/(tabs)/ledger-filters.tsx)
// — audit_log only grows over time, so filtering is a real query.eq()/gte()/
// lte() in page.tsx, not a client-side re-filter of whatever the AUDIT_LIMIT
// cap happened to return. AUDIT_TABLE_OPTIONS itself lives in audit-diff.ts
// (see the comment there for why), re-exported here so existing imports of
// it from this file keep working.
export { AUDIT_TABLE_OPTIONS };

export function AuditFilters({
  table,
  from,
  to,
}: {
  table: string;
  from: string;
  to: string;
}) {
  const hasFilters = !!(table || from || to);

  return (
    <form action="/audit" className="flex flex-wrap items-end gap-3 border-b border-border p-4">
      <Field label="Table" htmlFor="table">
        <Select
          id="table"
          name="table"
          defaultValue={table}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="">All tables</option>
          {AUDIT_TABLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From" htmlFor="from">
        <Input id="from" name="from" type="date" defaultValue={from} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </Field>
      <Field label="To" htmlFor="to">
        <Input id="to" name="to" type="date" defaultValue={to} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </Field>
      <Button type="submit" variant="secondary" size="sm">
        Apply
      </Button>
      {hasFilters && (
        <Link href="/audit" className="text-sm text-muted hover:text-foreground hover:underline">
          Clear filters
        </Link>
      )}
    </form>
  );
}

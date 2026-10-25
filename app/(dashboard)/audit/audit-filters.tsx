"use client";

import Link from "next/link";
import { Field, Input, Select } from "@/components/ui/form";
import { todayIst } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AUDIT_ACTION_OPTIONS, AUDIT_TABLE_OPTIONS } from "./audit-diff";
import { DateInput } from "@/components/ui/date-input";

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
  user,
  action,
  record,
  users,
}: {
  table: string;
  from: string;
  to: string;
  user: string;
  action: string;
  record: string;
  users: { id: string; name: string }[];
}) {
  const hasFilters = !!(table || from || to || user || action || record);

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
      <Field label="Action" htmlFor="action">
        <Select id="action" name="action" defaultValue={action} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          <option value="">All actions</option>
          {AUDIT_ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Changed by" htmlFor="user">
        <Select id="user" name="user" defaultValue={user} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          <option value="">Everyone</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Record (batch, AR, PO or code)" htmlFor="record">
        <Input id="record" name="record" type="search" defaultValue={record} maxLength={60} placeholder="e.g. ARRM-0001/26" />
      </Field>
      <Field label="From" htmlFor="from">
        <DateInput id="from" name="from" defaultValue={from} max={to || todayIst()} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </Field>
      <Field label="To" htmlFor="to">
        <DateInput id="to" name="to" defaultValue={to} min={from || undefined} max={todayIst()} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </Field>
      {from && to && from > to && <p className="basis-full text-sm text-red">From date cannot be after To date.</p>}
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

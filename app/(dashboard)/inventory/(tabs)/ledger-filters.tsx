"use client";

import Link from "next/link";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { isLegacyCode, todayIst } from "@/lib/utils";
import { LEDGER_FILTER_OPTIONS } from "@/lib/ledger-reasons";

// Inventory Ledger redesign, Phase 4 (claude/inventory-ledger-redesign.md,
// Option A folded into this phase) — the Ledger tab was a flat,
// unfiltered chronological log capped at 1,000 rows; on a table already
// past 92,000 legacy purchase lines alone, finding "everything that
// happened to this item" or "everything in this date range" meant
// scrolling and eyeballing. These are real server-side query filters
// (submitted as a GET form, matching the RM Report's `asOf` pattern), not
// a client-side re-filter of whatever page the 1,000-row cap happened to
// return — the same row-cap-truncation lesson this app's other pickers
// already learned the hard way (see claude/known-issues.md).
export type ItemFilterOption = { id: string; name: string; item_code: string };

export function LedgerFilters({
  items,
  itemId,
  referenceType,
  from,
  to,
}: {
  items: ItemFilterOption[];
  itemId: string;
  referenceType: string;
  from: string;
  to: string;
}) {
  const hasFilters = !!(itemId || referenceType || from || to);

  return (
    <form action="/inventory" className="flex flex-wrap items-end gap-3 border-b border-border p-4">
      <Field label="Item" htmlFor="item">
        <Select
          id="item"
          name="item"
          defaultValue={itemId}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="">All items</option>
          {items.map((it) => (
            <option key={it.id} value={it.id} data-legacy={isLegacyCode(it.item_code) ? "1" : undefined}>
              {it.name} ({it.item_code})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reason" htmlFor="reference_type">
        <Select
          id="reference_type"
          name="reference_type"
          defaultValue={referenceType}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="">All reasons</option>
          {LEDGER_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From" htmlFor="from">
        <Input id="from" name="from" type="date" defaultValue={from} max={to || todayIst()} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </Field>
      <Field label="To" htmlFor="to">
        <Input id="to" name="to" type="date" defaultValue={to} min={from || undefined} max={todayIst()} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
      </Field>
      {from && to && from > to && <p className="basis-full text-sm text-red">From date cannot be after To date.</p>}
      <Button type="submit" variant="secondary" size="sm">
        Apply
      </Button>
      {hasFilters && (
        <Link href="/inventory" className="text-sm text-muted hover:text-foreground hover:underline">
          Clear filters
        </Link>
      )}
    </form>
  );
}

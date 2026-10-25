"use client";

import { Field, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";

export function StatementFilter({
  from,
  to,
  category,
  today,
}: {
  from: string;
  to: string;
  category: string;
  today: string;
}) {
  return (
    <form action="/inventory/stock-statement" className="flex flex-wrap items-end gap-3 border-b border-border p-4">
      <Field label="From" htmlFor="from">
        <DateInput id="from" name="from" defaultValue={from} max={today} required />
      </Field>
      <Field label="To" htmlFor="to">
        <DateInput id="to" name="to" defaultValue={to} max={today} required />
      </Field>
      <Field label="Category" htmlFor="category">
        <Select id="category" name="category" defaultValue={category}>
          <option value="">All</option>
          <option value="raw">Raw material</option>
          <option value="packaging">Packaging</option>
          <option value="processed">Finished product</option>
          <option value="packaged_fp">Packaged finished product</option>
        </Select>
      </Field>
      <Button type="submit" variant="secondary" size="sm">
        Apply
      </Button>
      <p className="basis-full text-xs text-muted">
        Opening is the stock at the start of the From day, closing the stock at the end of the To day (India time). Use From and To the same day for one day. Opening load is stock loaded through Opening Stock. Rejected is what QC rejected less what was handed back when it was written off. Items that are now inactive are included if they had stock or movement in the period (Stock Position hides them).
      </p>
    </form>
  );
}

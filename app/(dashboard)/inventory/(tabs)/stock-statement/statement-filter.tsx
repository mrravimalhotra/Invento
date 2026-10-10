"use client";

import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

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
        <Input id="from" name="from" type="date" defaultValue={from} max={today} required />
      </Field>
      <Field label="To" htmlFor="to">
        <Input id="to" name="to" type="date" defaultValue={to} max={today} required />
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
        Opening is the stock at the start of the From day, closing the stock at the end of the To day (India time). Use From and To the same day for one day.
      </p>
    </form>
  );
}

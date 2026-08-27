"use client";

import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export function RmReportFilter({ asOf }: { asOf: string }) {
  return (
    <form action="/inventory/rm-report" className="flex flex-wrap items-end gap-3 border-b border-border p-4">
      <Field label="As on date" htmlFor="asOf">
        <Input
          id="asOf"
          name="asOf"
          type="date"
          defaultValue={asOf}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        />
      </Field>
      <Button type="submit" variant="secondary" size="sm">
        Apply
      </Button>
    </form>
  );
}

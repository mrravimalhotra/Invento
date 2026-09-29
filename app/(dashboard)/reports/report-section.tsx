"use client";

import { toIstDateString } from "@/lib/utils";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { downloadPdfTable } from "@/lib/pdf";

export type ReportColumn<T> = {
  header: string;
  /** Rendered cell for the on-screen DataTable. */
  cell: (row: T) => React.ReactNode;
  /** Plain value for the exported PDF table (and for text search). */
  pdfValue: (row: T) => string | number;
};

export function ReportSection<T>({
  title,
  description,
  rows,
  columns,
  dateOf,
  dateLabel = "Date",
  filename,
}: {
  title: string;
  description?: string;
  rows: T[];
  columns: ReportColumn<T>[];
  /** ISO date string (or null) this report's date-range filter applies to. Omit for no filter. */
  dateOf?: (row: T) => string | null | undefined;
  dateLabel?: string;
  filename: string;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const inputId = filename.replace(/[^a-z0-9]/gi, "-");

  const filtered = useMemo(() => {
    if (!dateOf || (!from && !to)) return rows;
    // ACC-13: compare IST calendar days ("YYYY-MM-DD" strings compare in
    // date order). Before, `new Date(from)` was UTC midnight, so the filter
    // window was 5½ hours off India time.
    return rows.filter((r) => {
      const d = dateOf(r);
      if (!d) return false;
      if (Number.isNaN(new Date(d).getTime())) return false;
      const day = toIstDateString(d);
      return (!from || day >= from) && (!to || day <= to);
    });
  }, [rows, from, to, dateOf]);

  const tableColumns: Column<T>[] = columns.map((c) => ({
    header: c.header,
    accessor: c.cell,
    searchValue: (r) => String(c.pdfValue(r) ?? ""),
  }));

  function handleDownload() {
    downloadPdfTable({
      title,
      columns: columns.map((c) => c.header),
      rows: filtered.map((r) => columns.map((c) => c.pdfValue(r))),
      filename: `${filename}.pdf`,
    });
  }

  return (
    <Card>
      <CardHeader
        title={`${title} (${filtered.length})`}
        action={
          <Button size="sm" variant="secondary" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </Button>
        }
      />
      <div className="border-b border-border px-5 py-4">
        {description && <p className="mb-3 text-sm text-muted">{description}</p>}
        {dateOf && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label={`${dateLabel} from`} htmlFor={`${inputId}-from`}>
              <Input
                id={`${inputId}-from`}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-auto"
              />
            </Field>
            <Field label={`${dateLabel} to`} htmlFor={`${inputId}-to`}>
              <Input
                id={`${inputId}-to`}
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-auto"
              />
            </Field>
            {(from || to) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
      <DataTable columns={tableColumns} rows={filtered} emptyLabel="No rows in range." />
    </Card>
  );
}

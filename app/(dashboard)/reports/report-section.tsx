"use client";

import { formatDate, toIstDateString, todayIst } from "@/lib/utils";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { exportTable, type ExportColumnType } from "@/lib/table-export";

// Loaded on click, not with the page (PERF-06): the PDF / Word library only
// downloads when someone actually asks for the file.
const downloadPdfTable = async (...args: Parameters<typeof import("@/lib/pdf").downloadPdfTable>) =>
  (await import("@/lib/pdf")).downloadPdfTable(...args);

export type ReportColumn<T> = {
  header: string;
  /** Heading used in the downloaded PDF / Excel when it should differ from the on-screen one (FB-0047: the screen says "Analytical Report No.", downloads keep "AR Number"). */
  exportHeader?: string;
  /** Rendered cell for the on-screen DataTable. */
  cell: (row: T) => React.ReactNode;
  /** Plain value for the exported PDF table (and for text search). */
  pdfValue: (row: T) => string | number;
  /**
   * Excel version of the column (export decision (c), 29 Sept 2026): a raw
   * number for quantities, a date / timestamp for dates, so Excel can sort and
   * add them up. Omit to use pdfValue as text.
   */
  xl?: { type: ExportColumnType; decimals?: number; value: (row: T) => string | number | null };
};

export function ReportSection<T>({
  title,
  description,
  rows,
  columns,
  dateOf,
  dateLabel = "Date",
  filename,
  isOpeningStock,
}: {
  title: string;
  description?: string;
  rows: T[];
  columns: ReportColumn<T>[];
  /** ISO date string (or null) this report's date-range filter applies to. Omit for no filter. */
  dateOf?: (row: T) => string | null | undefined;
  dateLabel?: string;
  filename: string;
  /** Opening stock (0100/0101): rows this returns true for came from the old records. Adds a Source filter on screen and a Source column in the downloads. */
  isOpeningStock?: (row: T) => boolean;
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

  const filterText = [
    from || to ? `${dateLabel}: ${from ? formatDate(from) : "start"} to ${to ? formatDate(to) : "today"}` : "All dates",
    `${filtered.length} row${filtered.length === 1 ? "" : "s"}`,
  ].join(" · ");

  function handleExcel() {
    void exportTable(
      {
        title,
        filename,
        formats: ["excel"],
        columns: [
          ...columns.map((c) => ({
            header: c.exportHeader ?? c.header,
            type: c.xl?.type ?? ("text" as ExportColumnType),
            decimals: c.xl?.decimals,
            value: c.xl ? c.xl.value : (r: T) => c.pdfValue(r),
          })),
          ...(isOpeningStock
            ? [{ header: "Source", type: "text" as ExportColumnType, value: (r: T) => (isOpeningStock(r) ? "Legacy" : "New") }]
            : []),
        ],
      },
      "excel",
      filtered,
      { search: "", hideLegacy: false, filterText }
    );
  }

  function handleDownload() {
    downloadPdfTable({
      title,
      columns: [...columns.map((c) => c.exportHeader ?? c.header), ...(isOpeningStock ? ["Source"] : [])],
      rows: filtered.map((r) => [...columns.map((c) => c.pdfValue(r)), ...(isOpeningStock ? [isOpeningStock(r) ? "Legacy" : "New"] : [])]),
      filename: `${filename}.pdf`,
      // What the printed rows are filtered by, so a printout can be read
      // without the screen it came from.
      subtitle: [
        from || to ? `${dateLabel}: ${from ? formatDate(from) : "start"} to ${to ? formatDate(to) : "today"}` : "All dates",
        `${filtered.length} row${filtered.length === 1 ? "" : "s"}`,
      ].join(" · "),
    });
  }

  return (
    <Card>
      <CardHeader
        title={`${title} (${filtered.length})`}
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleExcel}>
              <Download className="h-3.5 w-3.5" />
              Download Excel
            </Button>
            <Button size="sm" variant="secondary" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </Button>
          </div>
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
                max={to || todayIst()}
                onChange={(e) => setFrom(e.target.value)}
                className="w-auto"
              />
            </Field>
            <Field label={`${dateLabel} to`} htmlFor={`${inputId}-to`}>
              <Input
                id={`${inputId}-to`}
                type="date"
                value={to}
                min={from || undefined}
                max={todayIst()}
                onChange={(e) => setTo(e.target.value)}
                className="w-auto"
              />
            </Field>
            {from && to && from > to && <p className="basis-full text-sm text-red">From date cannot be after To date.</p>}
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
      <DataTable columns={tableColumns} rows={filtered} emptyLabel="No rows in range." isOpeningStock={isOpeningStock} />
    </Card>
  );
}

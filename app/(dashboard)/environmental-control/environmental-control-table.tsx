"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDateTime, formatNumber } from "@/lib/utils";

export type EnvReadingRow = {
  id: string;
  area: string;
  temperature: string | number | null;
  humidity: string | number | null;
  recorded_at: string;
};

export function EnvironmentalControlTable({ rows }: { rows: EnvReadingRow[] }) {
  const columns: Column<EnvReadingRow>[] = [
    { header: "Area", accessor: (r) => <span className="font-medium">{r.area}</span>, searchValue: (r) => r.area },
    { header: "Temperature (°C)", accessor: (r) => formatNumber(r.temperature, 1) },
    { header: "Humidity (%RH)", accessor: (r) => formatNumber(r.humidity, 1) },
    // ACC-40: recorded_at is a timestamp — show the time too, in IST.
    { header: "Recorded at", accessor: (r) => <span className="whitespace-nowrap">{formatDateTime(r.recorded_at)}</span>, sortValue: (r) => r.recorded_at },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search by area…"
      emptyLabel="No environmental readings recorded yet."
    />
  );
}

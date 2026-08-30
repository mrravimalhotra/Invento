"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber } from "@/lib/utils";

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
    { header: "Recorded at", accessor: (r) => formatDate(r.recorded_at) },
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

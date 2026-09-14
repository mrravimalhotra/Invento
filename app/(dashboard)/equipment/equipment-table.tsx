"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";

export type EquipmentRow = {
  id: string;
  equipment_code: string;
  name: string;
  room_no: string | null;
  section: string | null;
  asset_id: string | null;
  quantity: number;
  calibration_status: string | null;
};

const CALIBRATION_LABELS: Record<string, string> = {
  calibrated: "Calibrated",
  due: "Due for calibration",
  not_applicable: "Not applicable",
};

export function EquipmentTable({ rows }: { rows: EquipmentRow[] }) {
  const columns: Column<EquipmentRow>[] = [
    {
      header: "Code",
      accessor: (r) => <span className="font-mono text-xs">{r.equipment_code}</span>,
      searchValue: (r) => r.equipment_code,
    },
    {
      header: "Name",
      accessor: (r) => (
        <Link href={`/equipment/${r.id}`} className="font-medium text-brand-dark hover:underline">
          {r.name}
        </Link>
      ),
      searchValue: (r) => r.name,
    },
    { header: "Room", accessor: (r) => r.room_no ?? "—", searchValue: (r) => r.room_no ?? "" },
    { header: "Section", accessor: (r) => r.section ?? "—", searchValue: (r) => r.section ?? "" },
    {
      header: "Asset ID",
      accessor: (r) => (r.asset_id ? <span className="font-mono text-xs">{r.asset_id}</span> : "—"),
      searchValue: (r) => r.asset_id ?? "",
    },
    { header: "Qty", accessor: (r) => r.quantity },
    {
      header: "Calibration",
      accessor: (r) =>
        r.calibration_status ? CALIBRATION_LABELS[r.calibration_status] ?? r.calibration_status : "—",
      searchValue: (r) => (r.calibration_status ? CALIBRATION_LABELS[r.calibration_status] ?? "" : ""),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyLabel="No equipment yet."
      searchPlaceholder="Search equipment, room, or asset ID…"
    />
  );
}

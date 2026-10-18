"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";
import { InactiveTag } from "@/components/ui/inactive-tag";
import type { TableExport } from "@/lib/table-export";
import { formatDate } from "@/lib/utils";
import { calibrationState } from "@/lib/calibration";
import { CalibrationBadge } from "./calibration-badge";

export type EquipmentRow = {
  id: string;
  equipment_code: string;
  name: string;
  room_no: string | null;
  section: string | null;
  asset_id: string | null;
  quantity: number;
  calibration_status: string | null;
  last_calibration_date: string | null;
  next_calibration_due: string | null;
  active: boolean;
};

// `today` comes from the server (India date) so the computed status is the same
// on the server and in the browser.
export function EquipmentTable({ rows, today }: { rows: EquipmentRow[]; today: string }) {
  const stateOf = (r: EquipmentRow) => calibrationState(r.calibration_status, r.next_calibration_due, today);
  const columns: Column<EquipmentRow>[] = [
    {
      header: "Code",
      accessor: (r) => (
        <>
          <span className="font-mono text-xs">{r.equipment_code}</span>
          <InactiveTag show={!r.active} />
        </>
      ),
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
      header: "Last calibration",
      accessor: (r) => formatDate(r.last_calibration_date),
      sortValue: (r) => r.last_calibration_date ?? "",
    },
    {
      header: "Next due",
      accessor: (r) => formatDate(r.next_calibration_due),
      sortValue: (r) => r.next_calibration_due ?? "",
    },
    {
      header: "Calibration",
      accessor: (r) => <CalibrationBadge state={stateOf(r)} />,
      searchValue: (r) => stateOf(r).label,
      sortValue: (r) => stateOf(r).days ?? Number.MAX_SAFE_INTEGER,
    },
  ];

  const exportConfig: TableExport<EquipmentRow> = {
    title: "Instrument and Equipment Master",
    filename: "equipment-master",
    formats: ["excel"],
    columns: [
      { header: "Code", value: (r) => r.equipment_code },
      { header: "Status", value: (r) => (r.active ? "Active" : "Inactive") },
      { header: "Name", value: (r) => r.name },
      { header: "Room", value: (r) => r.room_no ?? "" },
      { header: "Section", value: (r) => r.section ?? "" },
      { header: "Asset ID", value: (r) => r.asset_id ?? "" },
      { header: "Qty", type: "number", decimals: 0, value: (r) => r.quantity },
      { header: "Last calibration", type: "date", value: (r) => r.last_calibration_date },
      { header: "Next due", type: "date", value: (r) => r.next_calibration_due },
      { header: "Calibration", value: (r) => stateOf(r).label },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyLabel="No equipment yet."
      searchPlaceholder="Search equipment, room, or asset ID…"
      isInactive={(r) => !r.active}
      exportConfig={exportConfig}
    />
  );
}

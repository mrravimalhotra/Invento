"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";
import { isLegacyCode } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";
import { InactiveTag } from "@/components/ui/inactive-tag";

export type VendorRow = {
  id: string;
  vendor_code: string;
  name: string;
  mobile: string | null;
  phone: string | null;
  email: string | null;
  active?: boolean;
};

export function VendorsTable({ rows }: { rows: VendorRow[] }) {
  const columns: Column<VendorRow>[] = [
    {
      header: "Code",
      accessor: (r) => <span className="font-mono text-xs">{r.vendor_code}</span>,
      searchValue: (r) => r.vendor_code,
    },
    {
      header: "Name",
      accessor: (r) => (
        <>
          <Link href={`/vendors/${r.id}`} className="font-medium text-brand-dark hover:underline">
            {r.name}
          </Link>
          <InactiveTag show={r.active === false} />
        </>
      ),
      searchValue: (r) => r.name,
    },
    { header: "Mobile", accessor: (r) => r.mobile ?? "—", searchValue: (r) => r.mobile ?? "" },
    { header: "Phone", accessor: (r) => r.phone ?? "—", searchValue: (r) => r.phone ?? "" },
    { header: "Email", accessor: (r) => r.email ?? "—", searchValue: (r) => r.email ?? "" },
  ];

  const exportConfig: TableExport<VendorRow> = {
    title: "Vendor Master",
    filename: "vendor-master",
    formats: ["excel"],
    columns: [
      { header: "Code", value: (r) => r.vendor_code },
      { header: "Name", value: (r) => r.name },
      { header: "Mobile", value: (r) => r.mobile ?? "" },
      { header: "Phone", value: (r) => r.phone ?? "" },
      { header: "Email", value: (r) => r.email ?? "" },
      { header: "Status", value: (r) => (r.active === false ? "Inactive" : "Active") },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyLabel="No vendors yet." emptyHint="Add one with Add new vendor, or load many with Bulk Data Upload."
      searchPlaceholder="Search vendors…"
      isLegacy={(r) => isLegacyCode(r.vendor_code)}
      isInactive={(r) => r.active === false}
      exportConfig={exportConfig}
    />
  );
}

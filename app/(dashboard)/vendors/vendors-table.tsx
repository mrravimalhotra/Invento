"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";

export type VendorRow = {
  id: string;
  vendor_code: string;
  name: string;
  mobile: string | null;
  phone: string | null;
  email: string | null;
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
        <Link href={`/vendors/${r.id}`} className="font-medium text-brand-dark hover:underline">
          {r.name}
        </Link>
      ),
      searchValue: (r) => r.name,
    },
    { header: "Mobile", accessor: (r) => r.mobile ?? "—", searchValue: (r) => r.mobile ?? "" },
    { header: "Phone", accessor: (r) => r.phone ?? "—", searchValue: (r) => r.phone ?? "" },
    { header: "Email", accessor: (r) => r.email ?? "—", searchValue: (r) => r.email ?? "" },
  ];

  return <DataTable columns={columns} rows={rows} emptyLabel="No vendors yet." searchPlaceholder="Search vendors…" />;
}

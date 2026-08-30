"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";

export type PurchaseRow = {
  id: string;
  po_number: string;
  invoice_number: string;
  invoice_date: string;
  vendor: { name: string } | null;
  lineCount: number;
  totalValue: number;
};

export function PurchaseTable({ rows }: { rows: PurchaseRow[] }) {
  const columns: Column<PurchaseRow>[] = [
    {
      header: "PO number",
      accessor: (r) => (
        <Link href={`/purchase/${r.id}`} className="font-mono text-xs font-medium text-brand-dark hover:underline">
          {r.po_number}
        </Link>
      ),
      searchValue: (r) => r.po_number,
    },
    { header: "Vendor", accessor: (r) => r.vendor?.name ?? "—", searchValue: (r) => r.vendor?.name ?? "" },
    { header: "Invoice #", accessor: (r) => r.invoice_number, searchValue: (r) => r.invoice_number },
    { header: "Invoice date", accessor: (r) => formatDate(r.invoice_date) },
    { header: "Lines", accessor: (r) => r.lineCount },
    { header: "Total value", accessor: (r) => formatNumber(r.totalValue) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyLabel="No purchase orders yet."
      searchPlaceholder="Search purchase orders…"
      isLegacy={(r) => isLegacyCode(r.po_number)}
    />
  );
}

"use client";

// The Type, Item, Batch and AR No. columns shared by the Rejected Materials,
// Retained Samples and Expiry & Retest Ageing tables (18 Oct 2026).

import Link from "next/link";
import type { Column } from "@/components/ui/data-table";
import { LegacyTag } from "@/components/ui/legacy-tag";

type BatchRowBase<K extends string> = {
  kind: K;
  itemId: string | null;
  itemCode: string;
  itemName: string;
  batch: string;
  isLegacy: boolean;
  arNumber: string | null;
};

export function batchIdentityColumns<K extends string, T extends BatchRowBase<K>>(kindLabels: Record<K, string>): Column<T>[] {
  return [
    {
      header: "Type",
      accessor: (r) => <span className="text-xs">{kindLabels[r.kind]}</span>,
      searchValue: (r) => kindLabels[r.kind],
    },
    {
      header: "Item",
      accessor: (r) => {
        const body = (
          <>
            <div className="font-medium">{r.itemName}</div>
            <div className="text-xs text-muted">{r.itemCode}</div>
          </>
        );
        return r.itemId ? (
          <Link href={`/inventory/items/${r.itemId}`} className="block hover:underline">
            {body}
          </Link>
        ) : (
          <div>{body}</div>
        );
      },
      searchValue: (r) => `${r.itemName} ${r.itemCode}`,
    },
    {
      header: "Batch",
      accessor: (r) => (
        <span className="whitespace-nowrap">
          {r.batch}
          <LegacyTag show={r.isLegacy} />
        </span>
      ),
      searchValue: (r) => r.batch,
    },
    { header: "AR No.", accessor: (r) => r.arNumber ?? "—", searchValue: (r) => r.arNumber ?? "" },
  ];
}

"use client";

import { useState } from "react";
import { useActionState } from "react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils";
import { lineFinancials } from "./line-financials";
import { deletePurchaseLine, type ActionState } from "@/lib/actions/purchase";

export type LineRow = {
  id: string;
  batch_number: string;
  quantity: string;
  unit: string;
  qc_qty: string;
  stability_qty: string;
  rnd_qty: string;
  remaining_qty: string;
  unit_price: string | null;
  gst_pct: string | null;
  expiry_date: string;
  item: { item_code: string; name: string; category: string } | null;
};

// FB-0018: Edit/Delete only rendered while the parent PO is still draft —
// once submitted, a line can only be changed after System Admin reopens
// the PO. `onEdit` lifts the picked row up to PurchaseLinesSection, which
// swaps the Add-line form for EditPurchaseLineForm; delete is small enough
// to be fully self-contained here.
function DeleteLineButton({ id }: { id: string }) {
  const boundAction = deletePurchaseLine.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        {state?.error && <p className="text-xs text-red">{state.error}</p>}
        <Button type="button" variant="danger" size="sm" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      {state?.error && <p className="text-xs text-red">{state.error}</p>}
      <p className="text-xs">Delete this line?</p>
      <div className="flex gap-1">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "…" : "Yes"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function PurchaseLinesTable({
  rows,
  editable,
  onEdit,
}: {
  rows: LineRow[];
  editable?: boolean;
  onEdit?: (id: string) => void;
}) {
  const columns: Column<LineRow>[] = [
    {
      header: "Item",
      accessor: (r) => (
        <span>
          <span className="font-mono text-xs text-muted">{r.item?.item_code}</span>
          <br />
          {r.item?.name}
        </span>
      ),
      searchValue: (r) => `${r.item?.item_code ?? ""} ${r.item?.name ?? ""}`,
    },
    { header: "Batch", accessor: (r) => <span className="font-mono text-xs">{r.batch_number}</span>, searchValue: (r) => r.batch_number },
    {
      header: "Quantity",
      accessor: (r) => (
        <span>
          {formatNumber(r.quantity)} {r.unit}
          <br />
          <span className="text-xs text-muted">
            of which {formatNumber(r.remaining_qty)} {r.unit} remaining after QC/Stability/R&D
          </span>
        </span>
      ),
    },
    { header: "QC qty", accessor: (r) => formatNumber(r.qc_qty) },
    { header: "Stability qty", accessor: (r) => formatNumber(r.stability_qty) },
    { header: "R&D qty", accessor: (r) => formatNumber(r.rnd_qty) },
    { header: "Unit price", accessor: (r) => formatNumber(r.unit_price) },
    { header: "GST %", accessor: (r) => formatNumber(r.gst_pct) },
    { header: "GST amount", accessor: (r) => formatNumber(lineFinancials(r).gstAmount) },
    { header: "Price incl. GST", accessor: (r) => formatNumber(lineFinancials(r).priceInclGst) },
    { header: "Line total", accessor: (r) => formatNumber(lineFinancials(r).lineTotal) },
    { header: "Expiry", accessor: (r) => formatDate(r.expiry_date) },
  ];

  if (editable) {
    columns.push({
      header: "Actions",
      accessor: (r) => (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => onEdit?.(r.id)}>
            Edit
          </Button>
          <DeleteLineButton id={r.id} />
        </div>
      ),
    });
  }

  return <DataTable columns={columns} rows={rows} emptyLabel="No lines added yet." searchPlaceholder="Search lines…" />;
}

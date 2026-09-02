"use client";

import { useState } from "react";
import { useActionState } from "react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils";
import { lineFinancials } from "./line-financials";
import { deletePurchaseLine, type ActionState } from "@/lib/actions/purchase";
import { downloadRmIntimationPdf } from "./rm-intimation-pdf";

export type LineRow = {
  id: string;
  batch_number: string;
  quantity: string;
  unit: string;
  qc_qty: string;
  stability_qty: string;
  rnd_qty: string;
  remaining_qty: string;
  // Inventory Ledger redesign, Phase 2 (0029_purchase_line_live_remaining_qty.sql,
  // claude/inventory-ledger-redesign.md Gap 2) — remaining_qty is static
  // (fixed at receipt, after QC/Stability/R&D sampling only); this is the
  // live figure, also net of Finished Product consumption and any wastage
  // recorded against this specific batch.
  live_remaining_qty: string;
  unit_price: string | null;
  gst_pct: string | null;
  expiry_date: string | null;
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

// "Against each raw material purchased under purchase lines, create Raw
// Material Intimation slip... At the end of the Raw Material line there
// should be link labeled RM Intimation to download pdf" (Ravi, 3 Sept
// 2026). Raw-material only — a packaging line never goes through QC
// sampling, so it has nothing for a "please sample this" slip to say.
// Bill No / Date come from the parent PO's own invoice_number/invoice_date
// (the header info already shown at the top of this page), not anything
// stored per-line.
function RmIntimationLink({
  row,
  poInvoiceNumber,
  poInvoiceDate,
  vendorName,
}: {
  row: LineRow;
  poInvoiceNumber: string;
  poInvoiceDate: string;
  vendorName: string;
}) {
  if (row.item?.category !== "raw") return <span className="text-muted">—</span>;
  return (
    <button
      type="button"
      className="text-xs text-brand hover:underline"
      onClick={() =>
        downloadRmIntimationPdf(
          {
            billNo: poInvoiceNumber,
            billDate: formatDate(poInvoiceDate),
            itemName: row.item?.name ?? "—",
            itemCode: row.item?.item_code ?? "—",
            quantity: row.quantity,
            unit: row.unit,
            vendorName,
            batchNumber: row.batch_number,
            qcQty: row.qc_qty,
            rndQty: row.rnd_qty,
          },
          `RM-Intimation_${row.item?.item_code ?? row.batch_number}_${row.batch_number}.pdf`
        )
      }
    >
      RM Intimation
    </button>
  );
}

export function PurchaseLinesTable({
  rows,
  editable,
  onEdit,
  poInvoiceNumber,
  poInvoiceDate,
  vendorName,
}: {
  rows: LineRow[];
  editable?: boolean;
  onEdit?: (id: string) => void;
  poInvoiceNumber: string;
  poInvoiceDate: string;
  vendorName: string;
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
      accessor: (r) => {
        // Phase 2: only show the live-remaining subline when it actually
        // differs from the post-sampling figure above it — i.e. this batch
        // has had real FP consumption or batch-tied wastage recorded
        // against it. Otherwise the two numbers are identical and a
        // second identical line would just be noise.
        const hasConsumption = Number(r.live_remaining_qty) !== Number(r.remaining_qty);
        return (
          <span>
            {formatNumber(r.quantity)} {r.unit}
            <br />
            <span className="text-xs text-muted">
              of which {formatNumber(r.remaining_qty)} {r.unit} remaining after QC/Stability/R&D
            </span>
            {hasConsumption && (
              <>
                <br />
                <span className="text-xs text-muted">
                  {formatNumber(r.live_remaining_qty)} {r.unit} remaining now (after production/wastage)
                </span>
              </>
            )}
          </span>
        );
      },
    },
    { header: "QC qty", accessor: (r) => formatNumber(r.qc_qty) },
    { header: "Stability qty", accessor: (r) => formatNumber(r.stability_qty) },
    { header: "R&D qty", accessor: (r) => formatNumber(r.rnd_qty) },
    { header: "Unit Price (₹)", accessor: (r) => formatNumber(r.unit_price) },
    { header: "GST %", accessor: (r) => formatNumber(r.gst_pct) },
    { header: "Item Total Excl GST (₹)", accessor: (r) => formatNumber(lineFinancials(r).itemTotalExclGst) },
    { header: "GST amount(₹)", accessor: (r) => formatNumber(lineFinancials(r).gstAmount) },
    { header: "Rate incl. GST(₹)", accessor: (r) => formatNumber(lineFinancials(r).priceInclGst) },
    { header: "Total Cost (₹)", accessor: (r) => formatNumber(lineFinancials(r).lineTotal) },
    // Packaging lines never carry a re-test date (2 Sept 2026) — the column
    // is shared across both categories in this one table, so a packaging
    // row just renders "—" (formatDate's own null handling) rather than
    // the column being conditionally hidden per row.
    { header: "Re-Test Date", accessor: (r) => formatDate(r.expiry_date) },
    {
      header: "RM Intimation",
      accessor: (r) => <RmIntimationLink row={r} poInvoiceNumber={poInvoiceNumber} poInvoiceDate={poInvoiceDate} vendorName={vendorName} />,
    },
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

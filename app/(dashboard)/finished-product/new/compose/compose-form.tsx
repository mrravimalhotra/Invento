"use client";

import { useActionState } from "react";
import { createFinishedProductBatch, type ActionState } from "@/lib/actions/finished-product";
import { Button, LinkButton } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

// One batch actually drawn from as part of an ingredient's automatic FIFO
// allocation (see allocateFifo() in page.tsx) — `qty` is how much of THIS
// batch is being taken, not how much the batch has left.
//
// Ravi (14 Sept 2026): "it should only show batch number, no need to show
// expiry/retest date while creating new finished product batch" — this
// used to also carry `expiryDate` (purchase_lines.expiry_date) and render
// it as "re-test <date>" next to the batch number. That field was never
// the real retest mechanism to begin with (see docs/modules/purchase.md,
// "Re-Test Date manual entry removed") — it stopped being collected at
// Purchase time on 3 Sept 2026 in favor of quality_checks.retest_date,
// computed automatically at QC approval from Retest Period (days) — so
// every batch received since then showed a bare "re-test —" here, which
// is what prompted this cleanup. Dropped end-to-end rather than just
// hidden: no more expiry_date column fetched in getCandidateBatches()
// (page.tsx), no more field on Candidate/Allocation.
export type Allocation = {
  purchaseLineId: string;
  batchNumber: string;
  qty: number;
};

export type ComposeLine = {
  itemId: string;
  itemLabel: string;
  quantity: number;
  unit: string;
  allocations: Allocation[];
  // How much of `quantity` could NOT be covered by any QC-Approved batch,
  // summed across every candidate. 0 means the allocation above fully
  // covers what's needed.
  shortfallQty: number;
};

export function ComposeForm({
  mfrDefinitionId,
  mfrVersion,
  targetQty,
  unit,
  expiryDate,
  lines,
}: {
  mfrDefinitionId: string;
  mfrVersion: number;
  targetQty: number;
  unit: string;
  expiryDate: string;
  lines: ComposeLine[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createFinishedProductBatch, undefined);

  // Blocked either because nothing was QC-Approved at all (allocations
  // empty) or because every QC-Approved batch together still doesn't cover
  // what's needed (shortfallQty > 0) — both are the same "can't submit"
  // condition per Ravi's answer (block submission, no partial batch).
  const blockedLines = lines.filter((l) => l.allocations.length === 0 || l.shortfallQty > 0);

  // Flatten each ingredient's (possibly multi-batch) allocation into one
  // finished_product_components row per batch drawn from. The server
  // action (parseComponents in lib/actions/finished-product.ts) already
  // just reads item_id_i/quantity_i/purchase_line_id_i for i in
  // [0, lineCount) with no assumption that each item_id is unique — it
  // never needed a change for this.
  const components = lines.flatMap((line) =>
    line.allocations.map((a) => ({ itemId: line.itemId, purchaseLineId: a.purchaseLineId, quantity: a.qty }))
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="mfr_definition_id" value={mfrDefinitionId} />
      <input type="hidden" name="mfr_version" value={mfrVersion} />
      <input type="hidden" name="target_qty" value={targetQty} />
      <input type="hidden" name="unit" value={unit} />
      <input type="hidden" name="expiry_date" value={expiryDate} />
      <input type="hidden" name="lineCount" value={components.length} />
      {components.map((c, i) => (
        <span key={i}>
          <input type="hidden" name={`item_id_${i}`} value={c.itemId} />
          <input type="hidden" name={`quantity_${i}`} value={c.quantity} />
          <input type="hidden" name={`purchase_line_id_${i}`} value={c.purchaseLineId} />
        </span>
      ))}

      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {blockedLines.length > 0 && (
        <p className="text-sm text-red">
          Not enough QC-Approved stock for: {blockedLines.map((l) => l.itemLabel).join(", ")}. This batch cannot be
          submitted until stock is available.
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Qty needed</th>
              <th className="px-3 py-2">Taken from (FIFO, automatic)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.itemId} className="border-b border-border last:border-0 align-top">
                <td className="px-3 py-2">{line.itemLabel}</td>
                <td className="px-3 py-2">
                  {formatNumber(line.quantity)} {line.unit}
                </td>
                <td className="px-3 py-2">
                  {line.allocations.length === 0 ? (
                    <span className="text-red">No QC-Approved batch available</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {line.allocations.map((a) => (
                        <div key={a.purchaseLineId}>
                          {a.batchNumber} · {formatNumber(a.qty)} {line.unit}
                        </div>
                      ))}
                      {line.shortfallQty > 0 && (
                        <div className="text-red">
                          Short by {formatNumber(line.shortfallQty)} {line.unit} — no further QC-Approved stock
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || blockedLines.length > 0}>
          {pending ? "Creating batch…" : "Create batch"}
        </Button>
        <LinkButton href="/finished-product/new" variant="secondary">
          Back
        </LinkButton>
      </div>
    </form>
  );
}

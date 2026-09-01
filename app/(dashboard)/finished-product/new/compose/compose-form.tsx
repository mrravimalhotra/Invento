"use client";

import { useActionState } from "react";
import { createFinishedProductBatch, type ActionState } from "@/lib/actions/finished-product";
import { Button, LinkButton } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";

export type ComposeCandidate = {
  purchaseLineId: string;
  batchNumber: string;
  expiryDate: string | null;
  remainingQty: string | number;
};

export type ComposeLine = {
  itemId: string;
  itemLabel: string;
  quantity: number;
  unit: string;
  candidates: ComposeCandidate[];
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
  const blockedLines = lines.filter((l) => l.candidates.length === 0);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="mfr_definition_id" value={mfrDefinitionId} />
      <input type="hidden" name="mfr_version" value={mfrVersion} />
      <input type="hidden" name="target_qty" value={targetQty} />
      <input type="hidden" name="unit" value={unit} />
      <input type="hidden" name="expiry_date" value={expiryDate} />
      <input type="hidden" name="lineCount" value={lines.length} />

      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {blockedLines.length > 0 && (
        <p className="text-sm text-red">
          No QC-Approved stock is available for: {blockedLines.map((l) => l.itemLabel).join(", ")}. This batch
          cannot be submitted until stock is available.
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Qty needed</th>
              <th className="px-3 py-2">RM batch (FIFO default)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={line.itemId} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <input type="hidden" name={`item_id_${i}`} value={line.itemId} />
                  <input type="hidden" name={`quantity_${i}`} value={line.quantity} />
                  {line.itemLabel}
                </td>
                <td className="px-3 py-2">
                  {formatNumber(line.quantity)} {line.unit}
                </td>
                <td className="px-3 py-2">
                  {line.candidates.length === 0 ? (
                    <span className="text-red">No QC-Approved batch available</span>
                  ) : (
                    <Select name={`purchase_line_id_${i}`} defaultValue={line.candidates[0].purchaseLineId} required>
                      {line.candidates.map((c) => (
                        <option
                          key={c.purchaseLineId}
                          value={c.purchaseLineId}
                          data-legacy={isLegacyCode(c.batchNumber) ? "1" : undefined}
                        >
                          {c.batchNumber} · exp {formatDate(c.expiryDate)} · {formatNumber(c.remainingQty)} avail.
                        </option>
                      ))}
                    </Select>
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

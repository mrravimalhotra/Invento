"use client";

import { downloadFpIntimationPdf } from "./fp-intimation-pdf";
import { formatDate } from "@/lib/utils";

// Ravi (15 Sept 2026): "when a Finished Product batch is submitted to QC, a
// Finish Product Intimation Slip should be generated and link should be
// available in Finished Product Screen similar to RM Intimation Slip."
// Rendered inside the detail page's "QC record" card, which itself already
// only shows once a quality_checks row exists for this batch (i.e. once
// Submit to QC has actually happened) — so this link's visibility is
// already gated on the trigger Ravi described, with no extra condition
// needed here. "Generated" means live client-side PDF generation on click
// (same as RM Intimation), not a stored file — regenerating it later
// always reflects the batch's current data.
export function FpIntimationLink({
  itemName,
  itemCode,
  batchNumber,
  batchQty,
  unit,
  qcSampleQty,
  submittedAt,
}: {
  itemName: string;
  itemCode: string;
  batchNumber: string;
  batchQty: string | number | null;
  unit: string;
  qcSampleQty: string | number | null;
  submittedAt: string;
}) {
  return (
    <button
      type="button"
      className="text-xs text-brand hover:underline"
      onClick={() =>
        downloadFpIntimationPdf(
          {
            date: formatDate(submittedAt),
            itemName,
            itemCode,
            batchNumber,
            batchQty: batchQty ?? 0,
            unit,
            qcSampleQty: qcSampleQty ?? 0,
          },
          `FP-Intimation_${itemCode}_${batchNumber}.pdf`
        )
      }
    >
      Finish Product Intimation Slip
    </button>
  );
}

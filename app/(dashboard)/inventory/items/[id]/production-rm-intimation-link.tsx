"use client";

import { COMPANY_NAME } from "@/lib/company";
import { formatDate } from "@/lib/utils";

// Loaded on click, not with the page (PERF-06): the PDF / Word library only
// downloads when someone actually asks for the file.
const downloadRmIntimationPdf = async (...args: Parameters<typeof import("@/app/(dashboard)/purchase/[id]/rm-intimation-pdf").downloadRmIntimationPdf>) =>
  (await import("@/app/(dashboard)/purchase/[id]/rm-intimation-pdf")).downloadRmIntimationPdf(...args);

// FB-0043 (28 Sept 2026): "In RM intimation slip for Raw Material created
// from Finished Product, Use Packaging unique Id in Invoice Number, and
// the date it was packaged as Invoice date." Reuses the existing RM
// Intimation Slip generator (purchase/[id]/rm-intimation-pdf.ts) exactly
// — same visual reproduction of the legacy Crystal Reports export, same
// 8-column table (Sr.No / R.M.Name / R.M.Code / Qty Purchased / Vendor
// Name / Batch No / QC Qty / R&D Qty) — rather than a second copy of that
// ~150-line jsPDF module, since a Production-issued batch needs exactly
// the same fields, just sourced differently:
//   - "Qty Purchased" -> production_issue_batches.quantity (the full
//     converted quantity, not the live remaining figure).
//   - Vendor Name -> fixed to "ATHARVA NATURE HEALTHCARE PVT. LTD." (Ravi's
//     explicit instruction and exact casing — there is no real vendor for
//     an internal FP -> RM conversion).
//   - Bill No / Date -> the source Packaging Issue's own code
//     (packaging_issues.code, e.g. "PKG-0004") and created_at (the date it
//     was packaged), reached via production_issue_batches.packaging_issue_id
//     — not the batch's own created_at (same moment in practice today, but
//     the Packaging Issue is Ravi's stated authoritative source).
const PRODUCTION_VENDOR_NAME = COMPANY_NAME;

export function ProductionRmIntimationLink({
  itemName,
  itemCode,
  batchNumber,
  quantity,
  unit,
  qcQty,
  rndQty,
  packagingCode,
  packagingCreatedAt,
}: {
  itemName: string;
  itemCode: string;
  batchNumber: string;
  quantity: string | number;
  unit: string;
  qcQty: string | number | null;
  rndQty: string | number | null;
  packagingCode: string | null;
  packagingCreatedAt: string | null;
}) {
  return (
    <button
      type="button"
      className="text-xs text-brand hover:underline"
      onClick={() =>
        downloadRmIntimationPdf(
          {
            billNo: packagingCode ?? "—",
            billDate: packagingCreatedAt ? formatDate(packagingCreatedAt) : "—",
            itemName,
            itemCode,
            quantity,
            unit,
            vendorName: PRODUCTION_VENDOR_NAME,
            batchNumber,
            qcQty: qcQty ?? 0,
            rndQty: rndQty ?? 0,
          },
          `RM-Intimation_${itemCode}_${batchNumber}.pdf`
        )
      }
    >
      RM Intimation
    </button>
  );
}

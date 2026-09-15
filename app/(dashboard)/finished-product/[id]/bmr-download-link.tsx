"use client";

import { useState } from "react";
import { downloadBmrDocx, type BmrComponentRow } from "./bmr-docx";

// Ravi (15 Sept 2026): "Once Batch is in Completed - Awaiting QC, start
// showing link to 'BATCH MANUFACTURING RECORD' as attached in the .docx
// format under Batch Header Section of Finished Product Screen." Rendered
// as an action in the "Batch header" card's own CardHeader — see
// page.tsx, where it's only mounted once `batch.status` has actually
// reached (or passed) `complete_awaiting_qc`, so this component itself
// needs no status check of its own.
//
// Unlike the jsPDF slips' synchronous `.save()`, `docx`'s `Packer.toBlob`
// is async — a small `pending` state disables the link and swaps its
// label while the document is being built, rather than leaving it
// silently clickable (and re-clickable) during that gap.
export function BmrDownloadLink({
  fpCode,
  fpName,
  batchNo,
  batchSize,
  unit,
  startDate,
  endDate,
  batchYield,
  yieldPct,
  rmObtainedDate,
  components,
}: {
  fpCode: string;
  fpName: string;
  batchNo: string;
  batchSize: string | number;
  unit: string;
  startDate: string;
  endDate: string;
  batchYield: string | number;
  yieldPct: string | number;
  rmObtainedDate: string;
  components: BmrComponentRow[];
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className="text-xs text-brand hover:underline disabled:opacity-50"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await downloadBmrDocx(
            { fpCode, fpName, batchNo, batchSize, unit, startDate, endDate, batchYield, yieldPct, rmObtainedDate, components },
            `BMR_${fpCode}_${batchNo}.docx`
          );
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? "Preparing…" : "Batch Manufacturing Record"}
    </button>
  );
}

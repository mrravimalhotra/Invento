"use client";

import { useState } from "react";
import { downloadBmrDocx, type BmrComponentRow } from "./bmr-docx";

// Ravi (15 Sept 2026): "Once Batch is in Completed - Awaiting QC, start
// showing link to 'BATCH MANUFACTURING RECORD' as attached in the .docx
// format under Batch Header Section of Finished Product Screen." Originally
// rendered as an action in the Finished Product detail page's "Batch
// header" card.
//
// Ravi (16 Sept 2026): "Move highlighted to Admin page and rename this to
// 'Batch Mfg. Record- Deprecated' we will later remove this functionality.
// Make a note that this needs to be removed from app later." — this
// surfaced a genuine naming collision with the real, existing, unrelated
// `/bmr` module (`docs/modules/bmr.md`, Module 10 — Prepared/Checked/
// Approved sign-off, weighment lines, observations), which is also called
// "Batch Mfg. Record" in the nav (lib/constants/nav.ts) and is also scoped
// to the same finished_product_batches row. Rather than keep two
// same-named features on the FP detail page, this one moved here (a
// dedicated Admin-only page — see page.tsx), its label became "Batch Mfg.
// Record- Deprecated" to make the distinction unmissable, and it's now
// flagged app-wide for future removal (see page.tsx's banner and
// claude/known-issues.md in the project). This component itself still does
// nothing but generate the .docx client-side — no DB writes, no status
// gate of its own; the caller decides which batches are eligible.
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
      {pending ? "Preparing…" : "Batch Mfg. Record- Deprecated"}
    </button>
  );
}

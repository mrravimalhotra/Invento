"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MfrDocxData } from "./mfr-docx";

// Loaded on click, not with the page (PERF-06): the PDF / Word library only
// downloads when someone actually asks for the file.
const downloadMfrDocx = async (...args: Parameters<typeof import("./mfr-docx").downloadMfrDocx>) =>
  (await import("./mfr-docx")).downloadMfrDocx(...args);

// Ravi (16 Sept 2026): "Print MFR option should give me .docx document in
// attached format" — replaces the LinkButton that used to send this click
// to /mfr/[id]/report (the jsPDF preview page, still reachable directly,
// just no longer linked from here — see mfr-docx.ts's header comment).
// Same disabled-while-building pattern as BmrDownloadLink, since
// Packer.toBlob() is async.
export function PrintMfrButton({ data, filename }: { data: MfrDocxData; filename: string }) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await downloadMfrDocx(data, filename);
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? "Preparing…" : "Print MFR"}
    </Button>
  );
}

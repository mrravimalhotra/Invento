"use client";

import { todayIst } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Loaded on click, not with the page (PERF-06): the PDF / Word library only
// downloads when someone actually asks for the file.
const downloadPdfTable = async (...args: Parameters<typeof import("@/lib/pdf").downloadPdfTable>) =>
  (await import("@/lib/pdf")).downloadPdfTable(...args);

export function PackagingExportButton({ rows }: { rows: (string | number)[][] }) {
  return (
    <Button
      variant="secondary"
      onClick={() =>
        downloadPdfTable({
          title: "Packing Register",
          columns: ["Code", "FP Batch", "Pack Size", "Unit Count", "Department", "Packaging Materials", "RM-FP Item Code", "RM-FP Batch", "Issue Date"],
          rows,
          filename: `packing-register-${todayIst()}.pdf`,
        })
      }
    >
      Export PDF
    </Button>
  );
}

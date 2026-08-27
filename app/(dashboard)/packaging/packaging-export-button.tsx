"use client";

import { downloadPdfTable } from "@/lib/pdf";
import { Button } from "@/components/ui/button";

export function PackagingExportButton({ rows }: { rows: (string | number)[][] }) {
  return (
    <Button
      variant="secondary"
      onClick={() =>
        downloadPdfTable({
          title: "Packing Register",
          columns: ["FP Batch", "Pack Size", "Unit Count", "Department", "Type", "Packaging Item", "Date"],
          rows,
          filename: `packing-register-${new Date().toISOString().slice(0, 10)}.pdf`,
        })
      }
    >
      Export PDF
    </Button>
  );
}

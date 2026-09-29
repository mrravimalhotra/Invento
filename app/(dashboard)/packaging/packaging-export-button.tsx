"use client";

import { todayIst } from "@/lib/utils";
import { downloadPdfTable } from "@/lib/pdf";
import { Button } from "@/components/ui/button";

export function PackagingExportButton({ rows }: { rows: (string | number)[][] }) {
  return (
    <Button
      variant="secondary"
      onClick={() =>
        downloadPdfTable({
          title: "Packing Register",
          columns: ["Code", "FP Batch", "Pack Size", "Unit Count", "Department", "Packaging Materials", "Date"],
          rows,
          filename: `packing-register-${todayIst()}.pdf`,
        })
      }
    >
      Export PDF
    </Button>
  );
}

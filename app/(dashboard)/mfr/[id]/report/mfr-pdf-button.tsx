"use client";

import { Button } from "@/components/ui/button";

export type MfrPdfData = {
  code: string;
  name: string;
  version: number;
  batchSizeQty: string | number;
  batchSizeUnit: string;
  finishedProductCode: string | null;
  itemType: string;
  approvedByName: string | null;
  approvedAt: string | null;
  lines: { itemLabel: string; quantity: string | number; unit: string }[];
  procedureIntro: string | null;
  procedureSteps: { stepNo: number; stage: string; operation: string }[];
  yieldLine: string | null;
};

export function MfrPdfButton({ data }: { data: MfrPdfData }) {
  // jsPDF is loaded on click, not with the page (see mfr-pdf.ts).
  return <Button onClick={async () => (await import("./mfr-pdf")).downloadMfrPdf(data)}>Download PDF</Button>;
}

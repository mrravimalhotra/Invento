"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { letterhead } from "@/lib/pdf";
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
};

export function MfrPdfButton({ data }: { data: MfrPdfData }) {
  function handleDownload() {
    const doc = new jsPDF();
    const startY = letterhead(doc, `Master Formula Record — ${data.code} (v${data.version})`);

    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text(`Product name: ${data.name}`, 14, startY);
    doc.text(`Finished product code: ${data.finishedProductCode ?? "—"}`, 14, startY + 6);
    doc.text(`Batch size: ${data.batchSizeQty} ${data.batchSizeUnit}`, 14, startY + 12);
    doc.text(`Item type: ${data.itemType}`, 14, startY + 18);
    doc.text(
      data.approvedByName ? `Approved by: ${data.approvedByName} on ${data.approvedAt}` : "Approval: Not approved",
      120,
      startY
    );

    autoTable(doc, {
      startY: startY + 26,
      head: [["#", "Item", "Quantity", "Unit"]],
      body: data.lines.map((l, i) => [String(i + 1), l.itemLabel, String(l.quantity), l.unit]),
      headStyles: { fillColor: [31, 111, 78], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2 },
      alternateRowStyles: { fillColor: [247, 249, 248] },
    });

    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 46;
    const sigY = finalY + 20;
    const labels = ["Prepared by", "Checked by", "Approved by"];
    labels.forEach((label, i) => {
      const x = 14 + i * 62;
      doc.setDrawColor(60, 60, 60);
      doc.line(x, sigY, x + 55, sigY);
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text(`${label} · Date:`, x, sigY + 5);
    });

    doc.save(`MFR-${data.code}-v${data.version}.pdf`);
  }

  return <Button onClick={handleDownload}>Download PDF</Button>;
}

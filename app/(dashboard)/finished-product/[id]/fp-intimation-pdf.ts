import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { drawCompanyHeading } from "@/lib/pdf-company-heading";

// Ravi (15 Sept 2026): "when a Finished Product batch is submitted to QC, a
// Finish Product Intimation Slip should be generated and link should be
// available in Finished Product Screen similar to RM Intimation Slip,"
// attaching a real sample ("A.Jatamansi Tail_PR06-26...pdf") of the legacy
// system's own "Finish Product Intimation Slip" export. This is the FP
// counterpart of app/(dashboard)/purchase/[id]/rm-intimation-pdf.ts —
// same approach (a plain, non-"use client" module doing client-side jsPDF
// generation, no Server Action, no migration, nothing persisted; called
// directly from a small client component's onClick — see
// fp-intimation-link.tsx), same real extracted Atharva logo (now shared
// from lib/atharva-logo.ts, see that file's own comment), same
// two-identical-copies-on-one-A4-page layout, same deliberately-local
// (not lib/pdf.ts) transcription of the company/Mfg-Lic text so this one
// legacy document is reproduced exactly rather than made to match the
// app's other, differently-worded PDF exports.
//
// Simpler than the RM slip: this sample has no "Bill No" row (Finished
// Product is manufactured, not purchased — there's no vendor invoice to
// cite) and only one quantity column, "QCSample Qty" (no R&D/Stability
// columns on this particular slip, even though those quantities exist on
// finished_product_batches too — matched to what the attached sample
// actually shows, not to every field this app happens to track).
export type FpIntimationData = {
  date: string;
  itemName: string;
  itemCode: string;
  batchNumber: string;
  batchQty: string | number;
  unit: string;
  qcSampleQty: string | number;
};


const LEFT_X = 10;
const RIGHT_X = 200;
const CENTER_X = 105;

// The sample shows quantities to 3 decimal places ("59.000Ltr",
// "0.300Ltr") rather than app-wide formatNumber()'s trimmed style ("59
// ltr") — matched here specifically for this printed slip, same as
// rm-intimation-pdf.ts's own qty3().
function qty3(n: string | number): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(num) ? num.toFixed(3) : "0.000";
}

// One copy of the slip, drawn with its logo/header starting at `top` (mm
// from the page top) — structurally the same as rm-intimation-pdf.ts's own
// drawSlip(), minus the Bill No row and with a 6-column, single-quantity
// table in place of RM's 8-column one.
function drawSlip(doc: jsPDF, data: FpIntimationData, top: number) {
  // FB-0046 (4 Oct 2026): logo on top with the company name directly below
  // it, then the address and licence number (from Admin -> Company Details),
  // centred. The rest of the slip sits lower by the height this adds.
  drawCompanyHeading(doc, { centerX: CENTER_X, top, logoWidth: 34, nameSizePt: 12.5, lineSizePt: 9.5 });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(11);
  doc.text("Finish Product Intimation Slip", CENTER_X, top + 33, { align: "center" });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(LEFT_X, top + 37, RIGHT_X, top + 37);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("To,", LEFT_X + 3, top + 44);
  doc.text("QC Department,", LEFT_X + 3, top + 50);
  doc.text("Respected Sir/Madam,", LEFT_X + 3, top + 56);
  doc.text(
    "Please do the sampling of following Finish Product and give the Certificate of Analysis ASAP.",
    LEFT_X + 3,
    top + 63
  );

  doc.setFont("helvetica", "bold");
  doc.text("Date :", 158, top + 44);
  doc.setFont("helvetica", "normal");
  doc.text(data.date, 175, top + 44);

  autoTable(doc, {
    startY: top + 68.5,
    margin: { left: LEFT_X, right: 210 - RIGHT_X },
    head: [["Sr.No.", "Name of The Product", "F.P.Code", "Batch No", "Batch Qty", "QCSample Qty"]],
    body: [
      [
        "1",
        data.itemName,
        data.itemCode,
        data.batchNumber,
        `${qty3(data.batchQty)} ${data.unit}`,
        `${qty3(data.qcSampleQty)} ${data.unit}`,
      ],
    ],
    theme: "grid",
    // Plain black-ruled table, no fill — same monochrome, no-brand-color
    // reproduction rm-intimation-pdf.ts uses for its own sample.
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8.5, halign: "center" },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      halign: "center",
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: { 1: { halign: "left" } },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? top + 85.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text("Thanking You", LEFT_X + 3, finalY + 16);
  doc.text("Production Chemist", LEFT_X + 3, finalY + 30);
  doc.text("Sampled By", CENTER_X, finalY + 30, { align: "center" });
  doc.text("QC Incharge", RIGHT_X, finalY + 30, { align: "right" });
}

export function downloadFpIntimationPdf(data: FpIntimationData, filename: string) {
  const doc = new jsPDF();
  // Two identical copies stacked on one A4 page, matching both the
  // attached sample and rm-intimation-pdf.ts's own precedent.
  drawSlip(doc, data, 7);
  drawSlip(doc, data, 155);
  doc.save(filename);
}

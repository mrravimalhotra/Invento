import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { drawCompanyHeading } from "@/lib/pdf-company-heading";

// "Against each raw material purchased under purchase lines, create Raw
// Material Intimation slip as per attached sample. At the end of the Raw
// Material line there should be link labeled RM Intimation to download
// pdf" (Ravi, 3 Sept 2026), followed by "update this so RM Intimation slip
// has exact same look and feel as attached. With Same Logo, design and
// color scheme" (Ravi, same day, re-attaching the same sample) — this is a
// close visual reproduction of that sample (a real Crystal Reports export
// off the legacy system), not just a field-matching one: the real Atharva
// logo (extracted from the sample PDF itself, see atharva-logo.ts), the
// same black-on-white plain-ruled layout (no brand-green fills — the
// sample itself is monochrome text with only the logo in color), and the
// same two-copies-on-one-A4-page arrangement. Deliberately a plain .ts
// module (not "use client"), same convention as generate-label-pdf.ts, so
// it can be called directly from purchase-lines-table.tsx's client row
// action without hitting the "can't call a client-file export from a
// Server Component" trap documented in lib/packaging-materials.ts.
//
// Company name, address and licence number are the saved company details
// (Admin -> Company Details), drawn with the logo on top and the name directly
// below it (FB-0046, 4 Oct 2026) by drawCompanyHeading().
export type RmIntimationData = {
  billNo: string;
  billDate: string;
  itemName: string;
  itemCode: string;
  quantity: string | number;
  unit: string;
  vendorName: string;
  batchNumber: string;
  qcQty: string | number;
  rndQty: string | number;
};


const LEFT_X = 10;
const RIGHT_X = 200;
const CENTER_X = 105;

// The sample shows quantities to 3 decimal places ("35.000 Kg", "0.050
// Kg", "0.000Kg") rather than app-wide formatNumber()'s trimmed style
// ("35 kg") — matched here specifically for this printed slip.
function qty3(n: string | number): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(num) ? num.toFixed(3) : "0.000";
}

// One copy of the slip, drawn with its logo/header starting at `top` (mm
// from the page top). Offsets below were measured directly off the
// attached sample (rendered at 200dpi, ink bounding boxes converted back
// to mm) so the two jsPDF copies land at essentially the same page
// positions as the original Crystal Reports export.
function drawSlip(doc: jsPDF, data: RmIntimationData, top: number) {
  // FB-0046 (4 Oct 2026): logo on top with the company name directly below
  // it, then the address and licence number (from Admin -> Company Details),
  // centred. The rest of the slip sits lower by the height this adds.
  drawCompanyHeading(doc, { centerX: CENTER_X, top, logoWidth: 34, nameSizePt: 12.5, lineSizePt: 9.5 });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(11);
  doc.text("Raw Material Intimation Slip", CENTER_X, top + 33, { align: "center" });

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(LEFT_X, top + 37, RIGHT_X, top + 37);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("To,", LEFT_X + 3, top + 44);
  doc.text("QC Department,", LEFT_X + 3, top + 50);
  doc.text("Respected Sir/Madam,", LEFT_X + 3, top + 56);
  doc.text(
    "Please do the sampling of following raw material and give the Certificate of Analysis ASAP.",
    LEFT_X + 3,
    top + 63
  );

  doc.setFont("helvetica", "bold");
  doc.text("Bill No :", 138, top + 44);
  doc.text("Date :", 138, top + 50);
  doc.setFont("helvetica", "normal");
  doc.text(data.billNo, 158, top + 44);
  doc.text(data.billDate, 158, top + 50);

  autoTable(doc, {
    startY: top + 68.5,
    margin: { left: LEFT_X, right: 210 - RIGHT_X },
    head: [["Sr.No.", "R.M.Name", "R.M.Code", "Qty Purchased", "Vendor Name", "Batch No", "QC Qty", "R&D Qty"]],
    body: [
      [
        "1",
        data.itemName,
        data.itemCode,
        `${qty3(data.quantity)} ${data.unit}`,
        data.vendorName,
        data.batchNumber,
        `${qty3(data.qcQty)} ${data.unit}`,
        `${qty3(data.rndQty)} ${data.unit}`,
      ],
    ],
    theme: "grid",
    // Plain black-ruled table, no fill — the sample itself has no colored
    // header band, just bold black text on white with black grid lines.
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8.5, halign: "center" },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      halign: "center",
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: { 1: { halign: "left" }, 4: { halign: "left" } },
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

export function downloadRmIntimationPdf(data: RmIntimationData, filename: string) {
  const doc = new jsPDF();
  // Two identical copies stacked on one A4 page (297mm tall), matching the
  // attached sample's own layout (measured second-copy start ~155mm).
  drawSlip(doc, data, 7);
  drawSlip(doc, data, 155);
  doc.save(filename);
}

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { COMPANY_NAME, MFG_LIC_NO } from "@/lib/pdf";

// "Against each raw material purchased under purchase lines, create Raw
// Material Intimation slip as per attached sample. At the end of the Raw
// Material line there should be link labeled RM Intimation to download
// pdf" (Ravi, 3 Sept 2026) — a one-line slip per purchase line (Bill No /
// Date come from the parent PO's own invoice_number/invoice_date), printed
// twice on one A4 page per the attached sample (two identical copies —
// one for QC's file, one to hand back). Deliberately a plain .ts module
// (not "use client"), same convention as generate-label-pdf.ts, so it can
// be called directly from purchase-lines-table.tsx's client row action
// without hitting the "can't call a client-file export from a Server
// Component" trap documented in lib/packaging-materials.ts.
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

const RIGHT_X = 196;
const LEFT_X = 14;
const CENTER_X = 105;

// The attached sample shows quantities to 3 decimal places ("35.000 Kg",
// "0.050 Kg", "0.000Kg") rather than app-wide formatNumber()'s trimmed
// style ("35") — matched here specifically for this printed slip.
function qty3(n: string | number): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(num) ? num.toFixed(3) : "0.000";
}

function drawSlip(doc: jsPDF, data: RmIntimationData, top: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(COMPANY_NAME, RIGHT_X, top + 6, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(`Mfg. Lic. No.- ${MFG_LIC_NO}`, RIGHT_X, top + 11, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text("Raw Material Intimation Slip", CENTER_X, top + 16, { align: "center" });

  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.2);
  doc.line(LEFT_X, top + 19, RIGHT_X, top + 19);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text("To,", LEFT_X, top + 25);
  doc.text("QC Department,", LEFT_X, top + 30);
  doc.text("Respected Sir/Madam,", LEFT_X, top + 35);
  doc.text("Please do the sampling of following raw material and give the Certificate of Analysis ASAP.", LEFT_X, top + 41);

  doc.setFont("helvetica", "bold");
  doc.text("Bill No :", 140, top + 25);
  doc.text("Date :", 140, top + 30);
  doc.setFont("helvetica", "normal");
  doc.text(data.billNo, 160, top + 25);
  doc.text(data.billDate, 160, top + 30);

  autoTable(doc, {
    startY: top + 46,
    margin: { left: LEFT_X, right: 210 - RIGHT_X },
    head: [["Sr.No", "R.M.Name", "R.M.Code", "Qty Purchased", "Vendor Name", "Batch No", "QC Qty", "R&D Qty"]],
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
    headStyles: { fillColor: [31, 111, 78], textColor: 255, fontSize: 7.5, halign: "center" },
    styles: { fontSize: 8, cellPadding: 2, halign: "center" },
    columnStyles: { 1: { halign: "left" }, 4: { halign: "left" } },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? top + 60;
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text("Thanking You", LEFT_X, finalY + 14);
  doc.text("Production Chemist", LEFT_X, finalY + 26);
  doc.text("Sampled By", CENTER_X, finalY + 26, { align: "center" });
  doc.text("QC Incharge", RIGHT_X, finalY + 26, { align: "right" });
}

export function downloadRmIntimationPdf(data: RmIntimationData, filename: string) {
  const doc = new jsPDF();
  // Two copies stacked on one A4 page (297mm tall), matching the attached
  // sample — top copy starts near the page top, bottom copy at roughly the
  // page's midpoint.
  drawSlip(doc, data, 10);
  drawSlip(doc, data, 152);
  doc.save(filename);
}

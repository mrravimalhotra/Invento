import { jsPDF } from "jspdf";
import { COMPANY_NAME, COMPANY_ADDRESS, MFG_LIC_NO } from "@/lib/pdf";

// Compact ~4in x 3in label layout, built directly with jsPDF (not the full
// letterhead() masthead in lib/pdf.ts — this is a small physical label, not
// a page). Reuses the same brand color + company details as the letterhead
// for visual consistency across every printed document. See DESIGN.md §4.11.

export type LabelType = "approved_rm" | "under_test" | "inprocess" | "finished_product";

export type LabelField = { label: string; value: string | null };

const BRAND_R = 31;
const BRAND_G = 111;
const BRAND_B = 78;

const HEADER_TEXT: Record<LabelType, string> = {
  approved_rm: "APPROVED RAW MATERIAL",
  under_test: "UNDER TEST",
  inprocess: "INPROCESS",
  finished_product: "Finished Product",
};

const WIDTH_MM = 101.6; // 4in
const HEIGHT_MM = 76.2; // 3in

export function downloadLabelPdf(type: LabelType, fields: LabelField[], filename: string) {
  const doc = new jsPDF({ unit: "mm", format: [WIDTH_MM, HEIGHT_MM] });
  const margin = 4;

  // Border
  doc.setDrawColor(BRAND_R, BRAND_G, BRAND_B);
  doc.setLineWidth(0.5);
  doc.rect(1.5, 1.5, WIDTH_MM - 3, HEIGHT_MM - 3);

  // Company masthead
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(BRAND_R, BRAND_G, BRAND_B);
  doc.text(COMPANY_NAME, WIDTH_MM / 2, 6, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(90, 90, 90);
  doc.text(`${COMPANY_ADDRESS} · Mfg. Lic. No.: ${MFG_LIC_NO}`, WIDTH_MM / 2, 9, { align: "center" });

  doc.setDrawColor(BRAND_R, BRAND_G, BRAND_B);
  doc.setLineWidth(0.2);
  doc.line(margin, 10.5, WIDTH_MM - margin, 10.5);

  // Label-type header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(BRAND_R, BRAND_G, BRAND_B);
  doc.text(HEADER_TEXT[type], WIDTH_MM / 2, 15.5, { align: "center" });

  // Fields
  let y = 20;
  const lineHeight = 5.7;
  const wrapLineHeight = 4;
  doc.setFontSize(7.5);

  fields.forEach((f) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 20, 20);
    const labelText = `${f.label}:`;
    doc.text(labelText, margin, y);
    const labelWidth = doc.getTextWidth(labelText + "  ");
    const valueX = margin + labelWidth;
    const maxWidth = WIDTH_MM - margin - valueX;

    doc.setFont("helvetica", "normal");
    if (f.value) {
      const lines = doc.splitTextToSize(f.value, maxWidth) as string[];
      lines.forEach((line, i) => doc.text(line, valueX, y + i * wrapLineHeight));
      y += Math.max(lineHeight, lines.length * wrapLineHeight + 1.5);
    } else {
      // blank line — filled in by hand after printing
      doc.setDrawColor(140, 140, 140);
      doc.setLineWidth(0.2);
      doc.line(valueX, y, WIDTH_MM - margin, y);
      y += lineHeight;
    }
  });

  doc.save(filename);
}

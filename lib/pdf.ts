import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const PDF_BRAND = "#1F6F4E";
export const COMPANY_NAME = "Atharva Nature Healthcare Pvt. Ltd.";
export const COMPANY_ADDRESS = "Wagholi, Pune";
export const MFG_LIC_NO = "PD/AYU-111";

export function letterhead(doc: jsPDF, title: string) {
  doc.setFontSize(14);
  doc.setTextColor(31, 111, 78);
  doc.text(COMPANY_NAME, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`${COMPANY_ADDRESS} · Mfg. Lic. No.: ${MFG_LIC_NO}`, 14, 21);
  doc.setDrawColor(31, 111, 78);
  doc.line(14, 24, 196, 24);
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(title, 14, 32);
  return 38; // y-offset for content start
}

export function downloadPdfTable({
  title,
  columns,
  rows,
  filename,
}: {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  filename: string;
}) {
  const doc = new jsPDF();
  const startY = letterhead(doc, title);
  autoTable(doc, {
    startY,
    head: [columns],
    body: rows.map((r) => r.map((c) => String(c ?? "—"))),
    headStyles: { fillColor: [31, 111, 78], textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [247, 249, 248] },
  });
  doc.save(filename);
}

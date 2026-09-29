import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ATHARVA_LOGO_PNG_BASE64, ATHARVA_LOGO_ASPECT } from "@/lib/atharva-logo";
import { COMPANY_NAME, COMPANY_ADDRESS, MFG_LIC_NO } from "@/lib/company";
import { getPdfUser } from "@/lib/pdf-user";
import { formatDateTime } from "@/lib/utils";

export const PDF_BRAND = "#1F6F4E";
// Re-exported so existing imports from "@/lib/pdf" keep working; the values
// live in lib/company.ts.
export { COMPANY_NAME, COMPANY_ADDRESS, MFG_LIC_NO };

// The shared letterhead for register-style PDFs (29 Sept 2026, ACC group 9
// decision (b)): logo, company name, address and licence number, a rule, then
// the document title (and an optional line describing the filter used).
// Returns the y position where content should start.
export function letterhead(doc: jsPDF, title: string, subtitle?: string | null) {
  const logoWidth = 26;
  const logoHeight = logoWidth / ATHARVA_LOGO_ASPECT;
  doc.addImage(ATHARVA_LOGO_PNG_BASE64, "PNG", 14, 8, logoWidth, logoHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(31, 111, 78);
  doc.text(COMPANY_NAME, 44, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`${COMPANY_ADDRESS} · Mfg. Lic. No.: ${MFG_LIC_NO}`, 44, 20.5);
  doc.setDrawColor(31, 111, 78);
  doc.line(14, 24, 196, 24);
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(title, 14, 32);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(subtitle, 14, 37.5);
    return 42;
  }
  return 38; // y-offset for content start
}

// Stamps every page with "Generated dd-mm-yyyy HH:mm by <name>" on the left
// and "Page X of Y" on the right. Call once, after all content is drawn.
export function addPageFooters(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const by = getPdfUser();
  const generated = `Generated ${formatDateTime(new Date())}${by ? ` by ${by}` : ""}`;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(generated, 14, height - 8);
    doc.text(`Page ${p} of ${total}`, width - 14, height - 8, { align: "right" });
  }
}

export function downloadPdfTable({
  title,
  columns,
  rows,
  filename,
  subtitle,
}: {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  filename: string;
  // Optional line under the title describing what the rows are filtered by.
  subtitle?: string | null;
}) {
  const doc = new jsPDF();
  const startY = letterhead(doc, title, subtitle);
  autoTable(doc, {
    startY,
    head: [columns],
    body: rows.map((r) => r.map((c) => String(c ?? "—"))),
    headStyles: { fillColor: [31, 111, 78], textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: [247, 249, 248] },
    margin: { bottom: 16 },
  });
  addPageFooters(doc);
  doc.save(filename);
}

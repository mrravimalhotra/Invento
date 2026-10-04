import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { drawCompanyHeading } from "@/lib/pdf-company-heading";
import { getPdfUser } from "@/lib/pdf-user";
import { formatDateTime } from "@/lib/utils";

export const PDF_BRAND = "#1F6F4E";
// The shared letterhead for register-style PDFs (29 Sept 2026, ACC group 9
// decision (b)): logo, company name, address and licence number, a rule, then
// the document title (and an optional line describing the filter used).
// Returns the y position where content should start.
export function letterhead(doc: jsPDF, title: string, subtitle?: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth();
  // FB-0046 (4 Oct 2026): logo on top, company name directly below it, then the
  // address and licence number, all centred; the title follows the rule.
  const bottom = drawCompanyHeading(doc, {
    centerX: pageWidth / 2,
    top: 8,
    logoWidth: 30,
    nameSizePt: 14,
    nameColor: [31, 111, 78],
    lineColor: [90, 90, 90],
  });
  const ruleY = bottom + 3.5;
  doc.setDrawColor(31, 111, 78);
  doc.line(14, ruleY, pageWidth - 14, ruleY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(title, 14, ruleY + 8);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(subtitle, 14, ruleY + 13.5);
    return ruleY + 18;
  }
  return ruleY + 14; // y-offset for content start
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

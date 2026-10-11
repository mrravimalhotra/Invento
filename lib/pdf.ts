import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { drawCompanyHeading } from "@/lib/pdf-company-heading";
import { getPdfUser } from "@/lib/pdf-user";
import { formatDateTime } from "@/lib/utils";
import { flash } from "@/lib/flash";
import { loadUnicodeFont } from "@/lib/pdf-font";

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
    // SCAN-P7-13: a long filter line wraps inside the margins instead of running off the page.
    const lines = doc.splitTextToSize(subtitle, pageWidth - 28) as string[];
    doc.text(lines, 14, ruleY + 13.5);
    return ruleY + 13.5 + (lines.length - 1) * 4 + 4.5;
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

// SCAN-P7-15: a PDF is built in the browser from every row. 10,000 rows is about
// 280 pages and 250 MB; far more freezes the tab. Above this many rows the person
// is asked to narrow the list (or use Excel, where the list has it) instead.
export const PDF_ROW_LIMIT = 3000;
const PDF_ROWS_PER_PAGE = 36;

// SCAN-P7-13: a column whose every value is short (a code, a number, a date, a unit) is given the
// width of its longest value and never wraps, so "RM-00031" and "1,250.5" stay in one piece. Longer
// columns (names, remarks) share the rest and wrap at spaces.
const SHORT_VALUE_CHARS = 16;
const CELL_PADDING = 2;

export type PdfLayout = {
  landscape: boolean;
  fontSize: number;
  columnStyles: Record<number, { cellWidth: number | "auto" }>;
};

export function planTableLayout(
  doc: jsPDF,
  columns: string[],
  body: string[][],
  usableWidth: (landscape: boolean) => number
): PdfLayout {
  const landscape = columns.length > 7;
  const available = usableWidth(landscape);
  const sizes = columns.length > 12 ? [7, 6.5, 6] : [8, 7, 6.5];
  let chosen: PdfLayout | null = null;
  for (const fontSize of sizes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const widths: (number | "auto")[] = columns.map((head, c) => {
      const cells = body.map((r) => r[c] ?? "");
      if (cells.some((v) => v.length > SHORT_VALUE_CHARS)) return "auto";
      const bodyMax = Math.max(0, ...cells.map((v) => doc.getTextWidth(v)));
      const headWord = Math.max(0, ...head.split(/\s+/).map((w) => doc.getTextWidth(w)));
      return Math.ceil((Math.max(bodyMax, headWord) + CELL_PADDING * 2 + 1) * 10) / 10;
    });
    const fixed = widths.reduce<number>((s, w) => s + (typeof w === "number" ? w : 0), 0);
    const autoCount = widths.filter((w) => w === "auto").length;
    const columnStyles: PdfLayout["columnStyles"] = {};
    widths.forEach((w, i) => (columnStyles[i] = { cellWidth: w }));
    chosen = { landscape, fontSize, columnStyles };
    // Leave at least 24 mm for each wrapping column.
    if (fixed + autoCount * 24 <= available) break;
  }
  return chosen as PdfLayout;
}

export async function downloadPdfTable({
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
  if (rows.length > PDF_ROW_LIMIT) {
    flash(
      `This PDF would be about ${Math.ceil(rows.length / PDF_ROWS_PER_PAGE).toLocaleString("en-IN")} pages (${rows.length.toLocaleString("en-IN")} rows). Narrow the list first (a date range or the search box) to ${PDF_ROW_LIMIT.toLocaleString("en-IN")} rows or fewer, or download Excel instead where the list has it.`,
      "error"
    );
    return;
  }
  const body = rows.map((r) => r.map((c) => String(c ?? "—")));
  // A4, upright up to 7 columns, sideways above that (SCAN-P7-13).
  const doc = new jsPDF({ orientation: columns.length > 7 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  await loadUnicodeFont(doc); // SCAN-P7-14: ₹, macron letters and Hindi print correctly
  const layout = planTableLayout(doc, columns, body, (landscape) => (landscape ? 297 : 210) - 28);
  const startY = letterhead(doc, title, subtitle);
  autoTable(doc, {
    startY,
    head: [columns],
    body,
    headStyles: { fillColor: [31, 111, 78], textColor: 255, fontSize: layout.fontSize },
    styles: { fontSize: layout.fontSize, cellPadding: CELL_PADDING, overflow: "linebreak" },
    columnStyles: layout.columnStyles,
    alternateRowStyles: { fillColor: [247, 249, 248] },
    margin: { bottom: 16 },
  });
  addPageFooters(doc);
  doc.save(filename);
}

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ATHARVA_LOGO_PNG_BASE64, ATHARVA_LOGO_ASPECT } from "./coa-logo";
import { getCompany, licenceLine, type Company } from "./company";
import { loadUnicodeFont } from "./pdf-font";

export type CoaPdfData = {
  coaNumber: string;
  subjectType: "raw_material" | "finished_product";
  headerFields: { label: string; value: string }[];
  resultLines: { seq: number; test: string; specification: string; result: string }[];
  remarks: string;
  // SCAN-P2-13: the company details the certificate was issued with. Absent on
  // certificates issued before 0112; those print the current details.
  company?: Company;
};

// Ravi (22 Sept 2026), from two sample paper COAs: "The format of pdf will
// be picture perfect and will be same as attached sample." This is a
// first pass at matching that layout closely — logo, company block,
// title/subtitle, a two-column header grid (headerFields is already
// ordered left-column-then-right-column by the caller — see the comments
// in app/(dashboard)/coa/new/page.tsx's resolveRawMaterial/
// resolveFinishedProduct — this function just splits it in half by
// position, it doesn't re-derive the layout), the Test/Result/
// Specification table, remarks line, and blank Analyzed-by/Approved-by
// signature lines (left blank, matching the sample, for a physical/wet
// signature rather than auto-filled with a name) — but pixel-for-pixel
// fidelity to a scanned paper form is inherently an iterate-once-you-can-
// compare-them job, not something to get exactly right blind. Expect a
// round of "here's what's off" against a real generated certificate.
export async function downloadCoaPdf(data: CoaPdfData) {
  const doc = new jsPDF();
  await loadUnicodeFont(doc, { italic: true }); // SCAN-P7-14
  const company = data.company ?? getCompany();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  const logoWidth = 55;
  const logoHeight = logoWidth / ATHARVA_LOGO_ASPECT;
  doc.addImage(ATHARVA_LOGO_PNG_BASE64, "PNG", (pageWidth - logoWidth) / 2, 10, logoWidth, logoHeight);

  let y = 10 + logoHeight + 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text(company.name, pageWidth / 2, y, { align: "center" });

  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(licenceLine(company), pageWidth / 2, y, { align: "center" });

  y += 5;
  doc.setDrawColor(31, 111, 78);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, pageWidth - marginX, y);

  y += 8;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text("CERTIFICATE OF ANALYSIS", pageWidth / 2, y, { align: "center" });
  const titleWidth = doc.getTextWidth("CERTIFICATE OF ANALYSIS");
  doc.setLineWidth(0.4);
  doc.line((pageWidth - titleWidth) / 2, y + 1.2, (pageWidth + titleWidth) / 2, y + 1.2);

  y += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(data.subjectType === "raw_material" ? "(Raw Material)" : "(Finished Product)", pageWidth / 2, y, {
    align: "center",
  });

  y += 8;
  const half = Math.ceil(data.headerFields.length / 2);
  const left = data.headerFields.slice(0, half);
  const right = data.headerFields.slice(half);
  const colWidth = (pageWidth - marginX * 2) / 2;
  const rightX = marginX + colWidth;
  const leftLabelW = 38;
  const rightLabelW = 32;
  const leftValueW = colWidth - leftLabelW - 3;
  const rightValueW = pageWidth - marginX - (rightX + rightLabelW);
  const lineHeight = 4.2; // one wrapped line at 9 pt
  const rowGap = 1.8;
  const gridStartY = y;
  doc.setFontSize(9);
  // SCAN-P4-10: every header value (and label) wraps inside its own column and the row grows to
  // fit, instead of one long value running over the next column.
  const rows = Math.max(left.length, right.length);
  let rowY = gridStartY;
  for (let i = 0; i < rows; i++) {
    let rowLines = 1;
    for (const [field, x, labelW, valueW] of [
      [left[i], marginX, leftLabelW, leftValueW],
      [right[i], rightX, rightLabelW, rightValueW],
    ] as const) {
      if (!field) continue;
      doc.setFont("helvetica", "bold");
      const labelLines = doc.splitTextToSize(field.label, labelW - 2) as string[];
      doc.text(labelLines, x, rowY);
      doc.setFont("helvetica", "normal");
      const valueLines = doc.splitTextToSize(`: ${field.value}`, valueW) as string[];
      doc.text(valueLines, x + labelW, rowY);
      rowLines = Math.max(rowLines, labelLines.length, valueLines.length);
    }
    rowY += rowLines * lineHeight + rowGap;
  }
  y = rowY + 4;

  autoTable(doc, {
    startY: y,
    head: [["S.N.", "Test", "Result", "Specification"]],
    body: data.resultLines.map((l) => [String(l.seq), l.test, l.result, l.specification]),
    headStyles: { fillColor: [31, 111, 78], textColor: 255, fontSize: 9, halign: "center" },
    styles: { fontSize: 8.5, cellPadding: 2.5, valign: "top" },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 45 },
      2: { cellWidth: 45 },
      3: { cellWidth: "auto" },
    },
    alternateRowStyles: { fillColor: [247, 249, 248] },
  });

  let cursorY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;

  // SCAN-P4-10: Remarks and the two signature lines never fall off the bottom: when they do not
  // fit under the table, they start on a new page.
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomLimit = pageHeight - 15;
  const remarksLineHeight = 5;
  const signatureBlock = 16 + 8; // gap above the line, line and label
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(20, 20, 20);
  const remarksLines = doc.splitTextToSize(`Remarks: ${data.remarks}`, pageWidth - marginX * 2) as string[];
  cursorY += 8;
  if (cursorY + remarksLines.length * remarksLineHeight + signatureBlock > bottomLimit) {
    // Keep the remarks and the signatures together where they fit on one page.
    if (remarksLines.length * remarksLineHeight + signatureBlock <= bottomLimit - 20) {
      doc.addPage();
      cursorY = 20;
    }
  }
  for (const line of remarksLines) {
    if (cursorY > bottomLimit - signatureBlock) {
      doc.addPage();
      cursorY = 20;
    }
    doc.text(line, marginX, cursorY);
    cursorY += remarksLineHeight;
  }

  cursorY += 16;
  if (cursorY + 8 > bottomLimit) {
    doc.addPage();
    cursorY = 30;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.line(marginX, cursorY, marginX + 50, cursorY);
  doc.line(pageWidth - marginX - 50, cursorY, pageWidth - marginX, cursorY);
  doc.text("Analyzed by", marginX, cursorY + 5);
  doc.text("Approved by", pageWidth - marginX - 50, cursorY + 5);

  doc.save(`${data.coaNumber}.pdf`);
}

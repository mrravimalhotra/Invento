import { jsPDF } from "jspdf";
import { COMPANY_NAME, COMPANY_ADDRESS, MFG_LIC_NO } from "@/lib/pdf";
import { CARLITO_BOLD_TTF_BASE64 } from "@/lib/fonts/carlito-bold";

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

// Approved Raw Material label (19 Sept 2026, revised 19 Sept 2026): Ravi
// supplied the actual print template ("Approved RAW MATERIAL LABELS.doc")
// and asked for an exact pixel-perfect copy of its size, format and font.
// It turned out to be a 6-up A4 sheet (2 cols x 3 rows of the identical
// label, for printing a batch's run of labels on one sheet and cutting
// them apart) rather than a single-label page — confirmed from Ravi's own
// screenshot of the template and cross-checked against the .doc's table
// structure (3 rows x 2 cols) and page size (A4). This renderer reproduces
// that: one A4 page, the same label content repeated in all 6 cells at the
// reference's measured grid position, built entirely from measurements
// taken off the reference (LibreOffice conversion + python-docx structural
// inspection + 200 DPI pixel measurement of both a single cell and the
// full page). See docs/modules/labels.md for the full measurement method.
// Deliberately scoped to this one label type — the other three (Under
// Test, In-process, Finished Product) were not part of the request and
// keep the original single-label brand-styled layout below.
//
// Font: the reference specifies Calibri (bold, every run) throughout.
// Calibri itself isn't licensed for redistribution, so this embeds Carlito
// — metrically identical, OFL-1.1 licensed, and what LibreOffice actually
// substitutes for Calibri (confirmed: it's what rendered the reference PDF
// used to take the measurements below) — see lib/fonts/carlito-bold.ts.
// The on-screen preview / JPEG export (rm-sheet-preview.tsx) embeds the
// same TTF as a CSS @font-face so both outputs use the identical typeface.
//
// Company name/address text: the reference's own text for this has an
// apparent copy/paste artifact — "Atharva Nature Healthcare Pvt,Ltd.Wagholi"
// on one line and "Pune" alone on the next (comma instead of period, no
// space, address run onto the name line). Rather than reproduce that
// glitch, this uses the app's canonical COMPANY_NAME / COMPANY_ADDRESS
// constants (same ones the rest of the app's PDFs use) in the same
// two-line position/font/size — flagging this as a deliberate deviation
// from the literal reference text, not an oversight.
//
// All layout constants and the per-cell line list (`buildRmLines`) are
// exported so rm-sheet-preview.tsx's on-screen/JPEG rendering shares the
// exact same numbers as this PDF path, rather than a second hand-tuned
// copy that could drift from it.
export const RM_PAGE_WIDTH_MM = 210;
export const RM_PAGE_HEIGHT_MM = 297;
export const RM_GRID_COLS = 2;
export const RM_GRID_ROWS = 3;
export const RM_GRID_ORIGIN_X_MM = 17.02;
export const RM_GRID_ORIGIN_Y_MM = 5.08;
export const RM_CELL_WIDTH_MM = 87.9;
export const RM_CELL_HEIGHT_MM = 96.0;
export const RM_LEFT_PAD_MM = 2.0;

// Literal field-prefix strings (label + padding spaces + colon) as measured
// from the reference document's runs — reproducing them exactly, spaces
// included, is what reproduces the reference's colon alignment when set in
// the same font/size, rather than recomputing alignment ourselves. Keyed by
// the `label` text label-picker.tsx already sends for approved_rm (which in
// a couple of cases differs slightly from the reference's own wording —
// e.g. no slash in "Invoice/Ch. No.", lowercase "of" in "Date of Receipt" —
// this maps app label -> reference's exact printed prefix).
const RM_FIELD_PREFIX: Record<string, string> = {
  Name: "Name                  :",
  Status: "Status                  :",
  "Batch No.": "Batch No.           :",
  "Batch Quantity": "Batch Quantity   :",
  "Purchased From": "Purchased From :",
  "Invoice/Ch. No.": "Invoice Ch. No.  :",
  "Date of Receipt": "Date Of Receipt  :",
  "Retest Period": "Retest Period       :",
  Sign: "Sign                        :",
};

// Y position (mm from the top of a single cell) of each field line's text
// baseline, in the same order label-picker.tsx builds the approved_rm
// fields array. Revised 19 Sept 2026 (see the header-line baselines below
// for why) — these values, and the header ones, are baselines proper:
// each was derived from the reference's rasterized glyph ink extents
// (topmost/bottommost dark pixel per line) plus Carlito's own font-file
// metrics (ascender/descender depth per glyph, via fontTools) to convert
// that ink bounding box into a true baseline position, not eyeballed from
// the band itself the way the original measurement pass did.
const RM_FIELD_Y_MM = [30.14, 37.19, 44.32, 51.38, 58.55, 65.66, 72.71, 79.88, 86.93];

const RM_VALUE_SIZE_PT = 11;
// A real batch's data (long vendor names, long batch codes, etc.) can be
// wider than the fixed prefix column leaves room for at 11pt — first
// found by Ravi with "Aditya Ayurvedic Supply co" as Purchased From,
// running past the cell's right border. Values now shrink to fit,
// stopping at this floor, well before wrapping to a second line would
// risk colliding with the field below it (only ~7mm of vertical gap
// between lines).
const RM_MIN_VALUE_SIZE_PT = 7;
// Right-hand safety margin, symmetric with RM_LEFT_PAD_MM.
const RM_RIGHT_PAD_MM = 2.0;

export type RmLineRun = { text: string; sizePt: number };
// One printed line within a single label cell. `runs` is normally one run;
// the "Mfg. Lic. No. : PD/AYU-111" line has two, at different sizes on a
// shared baseline, and a field line with a value has two (a fixed-size
// prefix + a value that may have been shrunk/truncated to fit) — neither
// jsPDF's text() nor a plain CSS span centers/sizes a mixed-run string as
// a unit, so both renderers measure/lay out from this same run list
// instead of hand-picking an x position or font size twice.
export type RmLine = { yMm: number; align: "center" | "left"; runs: RmLineRun[] };

// Shrinks (and, as a last resort, truncates with an ellipsis) `value` so it
// fits in the width left over after `prefixWithGap` on an 87.9mm-wide
// label cell — using `doc`'s own font metrics (Carlito Bold must already
// be selected on it) so the PDF and the on-screen/JPEG preview, which
// passes in its own measuring jsPDF instance, make the exact same
// shrink/truncate decision for the same data.
function fitRmValueRun(doc: jsPDF, prefixWithGap: string, value: string): RmLineRun {
  doc.setFontSize(RM_VALUE_SIZE_PT);
  const prefixWidth = doc.getTextWidth(prefixWithGap);
  const maxValueWidth = Math.max(0, RM_CELL_WIDTH_MM - RM_LEFT_PAD_MM - RM_RIGHT_PAD_MM - prefixWidth);

  let width = doc.getTextWidth(value);
  if (width <= maxValueWidth) return { text: value, sizePt: RM_VALUE_SIZE_PT };

  // Shrink proportionally to an estimate, then step down until it actually
  // measures within budget — font metrics aren't perfectly linear with size.
  let size = Math.max(RM_MIN_VALUE_SIZE_PT, Math.floor((RM_VALUE_SIZE_PT * (maxValueWidth / width)) * 2) / 2);
  doc.setFontSize(size);
  width = doc.getTextWidth(value);
  while (width > maxValueWidth && size > RM_MIN_VALUE_SIZE_PT) {
    size -= 0.5;
    doc.setFontSize(size);
    width = doc.getTextWidth(value);
  }
  if (width <= maxValueWidth) return { text: value, sizePt: size };

  // Still doesn't fit at the floor size — truncate rather than let it
  // bleed past the label's edge.
  doc.setFontSize(RM_MIN_VALUE_SIZE_PT);
  let truncated = value;
  while (truncated.length > 1 && doc.getTextWidth(truncated + "…") > maxValueWidth) {
    truncated = truncated.slice(0, -1);
  }
  return { text: truncated + "…", sizePt: RM_MIN_VALUE_SIZE_PT };
}

// Builds the ordered list of lines for one label cell — shared by the PDF
// renderer below and rm-sheet-preview.tsx's on-screen/JPEG renderer, so
// both draw from the exact same content and position numbers. `doc` is
// used only for text-width measurement (shrink-to-fit values, and
// centering the mixed-size Mfg. Lic. line) and must already have Carlito
// Bold selected as its current font.
export function buildRmLines(fields: LabelField[], doc: jsPDF): RmLine[] {
  const lines: RmLine[] = [
    { yMm: 4.5, align: "center", runs: [{ text: COMPANY_NAME, sizePt: 13 }] },
    { yMm: 10.12, align: "center", runs: [{ text: COMPANY_ADDRESS, sizePt: 13 }] },
    {
      yMm: 15.65,
      align: "center",
      runs: [
        { text: "Mfg. Lic. No. :", sizePt: 13 },
        { text: ` ${MFG_LIC_NO}`, sizePt: 11 },
      ],
    },
    { yMm: 20.62, align: "center", runs: [{ text: "APPROVED  RAW MATERIAL", sizePt: 11 }] },
  ];

  fields.forEach((f, i) => {
    const prefix = RM_FIELD_PREFIX[f.label];
    const y = RM_FIELD_Y_MM[i];
    if (prefix === undefined || y === undefined) return; // unexpected field — skip rather than misplace it
    if (!f.value) {
      lines.push({ yMm: y, align: "left", runs: [{ text: prefix, sizePt: 11 }] });
      return;
    }
    const prefixWithGap = `${prefix}  `;
    const valueRun = fitRmValueRun(doc, prefixWithGap, f.value);
    lines.push({
      yMm: y,
      align: "left",
      runs: [{ text: prefixWithGap, sizePt: 11 }, valueRun],
    });
  });

  return lines;
}

function drawRmCell(doc: jsPDF, lines: RmLine[], originX: number, originY: number) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(originX + 0.15, originY + 0.15, RM_CELL_WIDTH_MM - 0.3, RM_CELL_HEIGHT_MM - 0.3);

  const centerX = originX + RM_CELL_WIDTH_MM / 2;
  doc.setTextColor(0, 0, 0);

  for (const line of lines) {
    const y = originY + line.yMm;
    if (line.runs.length === 1) {
      doc.setFontSize(line.runs[0].sizePt);
      const x = line.align === "center" ? centerX : originX + RM_LEFT_PAD_MM;
      doc.text(line.runs[0].text, x, y, { align: line.align });
      continue;
    }
    // Multi-run line (the mixed-size Mfg. Lic. No. line) — measure each
    // run's width at its own size, then lay the runs out left-to-right
    // starting from a point that centers the whole group as a unit.
    const widths = line.runs.map((r) => {
      doc.setFontSize(r.sizePt);
      return doc.getTextWidth(r.text);
    });
    const totalWidth = widths.reduce((a, b) => a + b, 0);
    let x = line.align === "center" ? centerX - totalWidth / 2 : originX + RM_LEFT_PAD_MM;
    line.runs.forEach((r, i) => {
      doc.setFontSize(r.sizePt);
      doc.text(r.text, x, y, { align: "left" });
      x += widths[i];
    });
  }
}

function downloadApprovedRmLabel(fields: LabelField[], filename: string) {
  const doc = new jsPDF({ unit: "mm", format: [RM_PAGE_WIDTH_MM, RM_PAGE_HEIGHT_MM] });
  doc.addFileToVFS("Carlito-Bold.ttf", CARLITO_BOLD_TTF_BASE64);
  doc.addFont("Carlito-Bold.ttf", "Carlito", "bold");
  doc.setFont("Carlito", "bold");

  // Computed once (not per cell) — all 6 cells show identical content, and
  // this keeps the shrink-to-fit measurement pass a single source of truth
  // for the whole page.
  const lines = buildRmLines(fields, doc);

  // One A4 page, the same label repeated in every cell of the reference's
  // 2-col x 3-row grid (Ravi: "6 labels per page as per template").
  for (let row = 0; row < RM_GRID_ROWS; row++) {
    for (let col = 0; col < RM_GRID_COLS; col++) {
      const originX = RM_GRID_ORIGIN_X_MM + col * RM_CELL_WIDTH_MM;
      const originY = RM_GRID_ORIGIN_Y_MM + row * RM_CELL_HEIGHT_MM;
      drawRmCell(doc, lines, originX, originY);
    }
  }

  doc.save(filename);
}

export function downloadLabelPdf(type: LabelType, fields: LabelField[], filename: string) {
  if (type === "approved_rm") {
    downloadApprovedRmLabel(fields, filename);
    return;
  }

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

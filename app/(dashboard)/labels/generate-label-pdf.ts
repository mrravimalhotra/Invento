import { jsPDF } from "jspdf";
import { COMPANY_NAME, COMPANY_ADDRESS, MFG_LIC_NO } from "@/lib/pdf";
import { CARLITO_BOLD_TTF_BASE64 } from "@/lib/fonts/carlito-bold";
import { LIBERATION_SERIF_BOLD_TTF_BASE64 } from "@/lib/fonts/liberation-serif-bold";

// Compact ~4in x 3in label layout, built directly with jsPDF (not the full
// letterhead() masthead in lib/pdf.ts — this is a small physical label, not
// a page). Reuses the same brand color + company details as the letterhead
// for visual consistency across every printed document. See DESIGN.md §4.11.

export type LabelType = "approved_rm" | "under_test" | "inprocess" | "finished_product";

export type LabelField = { label: string; value: string | null };

const BRAND_R = 31;
const BRAND_G = 111;
const BRAND_B = 78;

export const HEADER_TEXT: Record<LabelType, string> = {
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

// Extra breathing room (19 Sept 2026, Ravi, after the ascender fix above
// still looked too tight to him visually): shifts the whole content block
// down by this much, uniformly, so every line keeps its measured spacing
// relative to the others — only the gap between the top border and the
// company name line (and correspondingly, the gap below Sign at the
// bottom, which had plenty of slack to spare) actually changes. Kept as
// its own named constant, separate from the reference-measured
// RM_FIELD_Y_MM / header values above, since it's a deliberate design
// choice layered on top of those, not a measurement.
const RM_TOP_MARGIN_EXTRA_MM = 2.0;

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

  return lines.map((line) => ({ ...line, yMm: line.yMm + RM_TOP_MARGIN_EXTRA_MM }));
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

// Finished Product & In-process labels (19 Sept 2026): Ravi supplied two
// more reference templates ("finish_products_GREEN_label_111.docx" and
// "in-process_label.docx") and asked to "Apply similar formatting for
// Finished Product & In Process Labels. Use attached as template" — the
// same pixel-perfect treatment as Approved Raw Material, for these other
// two label types. Measured the same way: LibreOffice conversion +
// python-docx structural inspection + 600 DPI pixel measurement of a
// single cell, cross-checked against font-file glyph metrics (fontTools)
// to derive true baselines rather than eyeballing the ink band. See
// docs/modules/labels.md for the full write-up.
//
// Both references are US Letter (215.9 x 279.4mm), not A4 — a 2-col x
// 3-row grid of the identical label, same shape as the RM sheet but a
// different page size/grid, so this gets its own constants rather than
// reusing RM_*. Unlike RM (13pt headers / 11pt fields, a couple of
// mixed-size lines), every line in both references is a single uniform
// 11pt — no per-line size table needed.
//
// Font: both specify Times New Roman (bold, every run), inherited from
// the document's default run properties rather than an explicit
// per-run override. Times New Roman isn't licensed for redistribution;
// this embeds Liberation Serif instead — metrically identical, OFL-1.1
// licensed, and what LibreOffice actually substituted when rendering
// the references for measurement (fc-match confirms it in this
// environment) — see lib/fonts/liberation-serif-bold.ts.
//
// Company header text: same deliberate deviation as RM. The references
// run the company name and address on one line as literal text
// "Atharva Nature Healthcare Pvt. Ltd.,Wagholi, Pune." (comma with no
// following space, before "Wagholi") and give the Mfg. Lic. No. with a
// slash ("PD/AYU/111") rather than the app's canonical dash
// ("PD/AYU-111"). This uses the canonical COMPANY_NAME / COMPANY_ADDRESS
// / MFG_LIC_NO constants (composed onto the same one-line / one-line
// layout and position) instead of reproducing those literal quirks —
// flagged here as with RM, not an oversight.
export const FPIP_PAGE_WIDTH_MM = 215.9; // US Letter
export const FPIP_PAGE_HEIGHT_MM = 279.4;
export const FPIP_GRID_COLS = 2;
export const FPIP_GRID_ROWS = 3;
export const FPIP_GRID_ORIGIN_X_MM = 6.33;
export const FPIP_CELL_WIDTH_MM = 100.01;
export const FPIP_GRID_ORIGIN_Y_MM = 25.46;
export const FPIP_LEFT_PAD_MM = 2.0;
export const FPIP_RIGHT_PAD_MM = 2.0;
// The reference's "Mfg. Lic. No." line, and the centered title line below
// it, both carry a 0.5in (720 twips) first-line indent in the source
// paragraph properties — confirmed in the rendering (measured 12.7mm
// further right than the un-indented lines above/below them), so it's
// reproduced as a real offset rather than dropped.
export const FPIP_INDENT_MM = 12.7;
export const FPIP_FONT_SIZE_PT = 11;
const FPIP_MIN_VALUE_SIZE_PT = 7;
// Baseline of the first line (company name) and the uniform line-to-line
// pitch, both in mm from the top of a cell — least-squares fit across all
// 19 measured lines (10 from the Finished Product reference, 9 from
// In-process; they share identical header-line positions, confirmed to
// within 0.02mm of each other) against each line's fontTools-derived
// ascender/descender-corrected baseline. Max residual across all 19
// points: 0.028mm.
const FPIP_LINE0_Y_MM = 3.685;
const FPIP_LINE_PITCH_MM = 6.685;

// Finished Product's reference table lays out at the very top of the page
// (table starts right at the 25.4mm top margin, same as RM). In-process's
// reference has 3 stray empty paragraphs above its table pushing it down
// ~14.6mm further — almost certainly a leftover copy/paste artifact in
// that one source document rather than an intentional difference (nothing
// else about the two documents' table/paragraph structure differs), so
// both label types share the same FPIP_GRID_ORIGIN_Y_MM above rather than
// In-process inheriting that offset. Flagged to Ravi rather than silently
// normalized.
export const FP_CELL_HEIGHT_MM = 67.03;
export const IP_CELL_HEIGHT_MM = 60.35;

export const FP_FIELD_PREFIX: Record<string, string> = {
  Name: "Name                  :",
  Status: "Status                  :",
  "Batch No.": "Batch No.            :",
  "Batch Quantity": "Batch Quantity   :",
  "Month of Manufacture": "Month of Manufacture:",
  "Best Before": "Best Before          :",
  Sign: "Sign                      :",
};
export const IP_FIELD_PREFIX: Record<string, string> = {
  Name: "Name                  :",
  Status: "Status                  :",
  "Batch No.": "Batch No.            :",
  "Batch Quantity": "Batch Quantity  :",
  "Start Date": "Start Date           :",
  Sign: "Sign                     :",
};

// Same shrink-to-fit / truncate-as-last-resort approach as RM's
// fitRmValueRun (see there for the rationale), parameterized here since
// Finished Product and In-process share one cell width and a single
// uniform font size rather than RM's per-field-line size.
function fitFpIpValueRun(doc: jsPDF, prefixWithGap: string, value: string): RmLineRun {
  doc.setFontSize(FPIP_FONT_SIZE_PT);
  const prefixWidth = doc.getTextWidth(prefixWithGap);
  const maxValueWidth = Math.max(0, FPIP_CELL_WIDTH_MM - FPIP_LEFT_PAD_MM - FPIP_RIGHT_PAD_MM - prefixWidth);

  let width = doc.getTextWidth(value);
  if (width <= maxValueWidth) return { text: value, sizePt: FPIP_FONT_SIZE_PT };

  let size = Math.max(FPIP_MIN_VALUE_SIZE_PT, Math.floor((FPIP_FONT_SIZE_PT * (maxValueWidth / width)) * 2) / 2);
  doc.setFontSize(size);
  width = doc.getTextWidth(value);
  while (width > maxValueWidth && size > FPIP_MIN_VALUE_SIZE_PT) {
    size -= 0.5;
    doc.setFontSize(size);
    width = doc.getTextWidth(value);
  }
  if (width <= maxValueWidth) return { text: value, sizePt: size };

  doc.setFontSize(FPIP_MIN_VALUE_SIZE_PT);
  let truncated = value;
  while (truncated.length > 1 && doc.getTextWidth(truncated + "…") > maxValueWidth) {
    truncated = truncated.slice(0, -1);
  }
  return { text: truncated + "…", sizePt: FPIP_MIN_VALUE_SIZE_PT };
}

// One printed line within a Finished Product / In-process cell. Unlike RM,
// every line here is a single run at one uniform size, but the three
// reference-measured horizontal positions (see FPIP_INDENT_MM above)
// aren't just "left" vs "center" the way RM's are — "left-indent" is the
// Mfg. Lic. line's indent, and "center-indent" is the title line centered
// within the indented region rather than the full cell width.
export type FpIpLine = { yMm: number; x: "left" | "left-indent" | "center-indent"; text: string; sizePt: number };
export type FpIpValueLine = { yMm: number; runs: RmLineRun[] };

export function buildFpIpLines(
  fields: LabelField[],
  doc: jsPDF,
  opts: { title: string; fieldPrefix: Record<string, string> }
): (FpIpLine | FpIpValueLine)[] {
  const lines: (FpIpLine | FpIpValueLine)[] = [
    {
      yMm: FPIP_LINE0_Y_MM,
      x: "left",
      text: `${COMPANY_NAME},${COMPANY_ADDRESS}.`,
      sizePt: FPIP_FONT_SIZE_PT,
    },
    {
      yMm: FPIP_LINE0_Y_MM + FPIP_LINE_PITCH_MM,
      x: "left-indent",
      text: `Mfg. Lic. No. : ${MFG_LIC_NO}`,
      sizePt: FPIP_FONT_SIZE_PT,
    },
    {
      yMm: FPIP_LINE0_Y_MM + 2 * FPIP_LINE_PITCH_MM,
      x: "center-indent",
      text: opts.title,
      sizePt: FPIP_FONT_SIZE_PT,
    },
  ];

  fields.forEach((f, i) => {
    const prefix = opts.fieldPrefix[f.label];
    const yMm = FPIP_LINE0_Y_MM + (3 + i) * FPIP_LINE_PITCH_MM;
    if (prefix === undefined) return; // unexpected field — skip rather than misplace it
    if (!f.value) {
      lines.push({ yMm, x: "left", text: prefix, sizePt: FPIP_FONT_SIZE_PT });
      return;
    }
    const prefixWithGap = `${prefix}  `;
    const valueRun = fitFpIpValueRun(doc, prefixWithGap, f.value);
    lines.push({
      yMm,
      runs: [{ text: prefixWithGap, sizePt: FPIP_FONT_SIZE_PT }, valueRun],
    });
  });

  return lines;
}

function drawFpIpCell(
  doc: jsPDF,
  lines: (FpIpLine | FpIpValueLine)[],
  originX: number,
  originY: number,
  cellHeightMm: number
) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(originX + 0.15, originY + 0.15, FPIP_CELL_WIDTH_MM - 0.3, cellHeightMm - 0.3);
  doc.setTextColor(0, 0, 0);

  const leftX = originX + FPIP_LEFT_PAD_MM;
  const indentX = leftX + FPIP_INDENT_MM;
  const centerIndentX = (indentX + (originX + FPIP_CELL_WIDTH_MM - FPIP_RIGHT_PAD_MM)) / 2;

  for (const line of lines) {
    const y = originY + line.yMm;
    if ("runs" in line) {
      // A field line with a value: prefix + (possibly shrunk) value, both
      // at FPIP_FONT_SIZE_PT here, left-aligned from the same x as every
      // other unindented line.
      let x = leftX;
      line.runs.forEach((r) => {
        doc.setFontSize(r.sizePt);
        doc.text(r.text, x, y, { align: "left" });
        x += doc.getTextWidth(r.text);
      });
      continue;
    }
    doc.setFontSize(line.sizePt);
    if (line.x === "center-indent") {
      doc.text(line.text, centerIndentX, y, { align: "center" });
    } else {
      doc.text(line.text, line.x === "left-indent" ? indentX : leftX, y, { align: "left" });
    }
  }
}

function downloadFpIpLabel(
  fields: LabelField[],
  filename: string,
  opts: { title: string; fieldPrefix: Record<string, string>; cellHeightMm: number }
) {
  const doc = new jsPDF({ unit: "mm", format: [FPIP_PAGE_WIDTH_MM, FPIP_PAGE_HEIGHT_MM] });
  doc.addFileToVFS("LiberationSerif-Bold.ttf", LIBERATION_SERIF_BOLD_TTF_BASE64);
  doc.addFont("LiberationSerif-Bold.ttf", "LiberationSerif", "bold");
  doc.setFont("LiberationSerif", "bold");

  const lines = buildFpIpLines(fields, doc, opts);

  for (let row = 0; row < FPIP_GRID_ROWS; row++) {
    for (let col = 0; col < FPIP_GRID_COLS; col++) {
      const originX = FPIP_GRID_ORIGIN_X_MM + col * FPIP_CELL_WIDTH_MM;
      const originY = FPIP_GRID_ORIGIN_Y_MM + row * opts.cellHeightMm;
      drawFpIpCell(doc, lines, originX, originY, opts.cellHeightMm);
    }
  }

  doc.save(filename);
}

export function downloadLabelPdf(type: LabelType, fields: LabelField[], filename: string) {
  if (type === "approved_rm") {
    downloadApprovedRmLabel(fields, filename);
    return;
  }
  if (type === "finished_product") {
    downloadFpIpLabel(fields, filename, {
      title: HEADER_TEXT.finished_product,
      fieldPrefix: FP_FIELD_PREFIX,
      cellHeightMm: FP_CELL_HEIGHT_MM,
    });
    return;
  }
  if (type === "inprocess") {
    downloadFpIpLabel(fields, filename, {
      title: HEADER_TEXT.inprocess,
      fieldPrefix: IP_FIELD_PREFIX,
      cellHeightMm: IP_CELL_HEIGHT_MM,
    });
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

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

// Approved Raw Material label (19 Sept 2026): Ravi supplied a reference
// template ("Approved RAW MATERIAL LABELS.doc") and asked for "exact pixel
// perfect copy" of its size, format and font — so this type gets its own
// dedicated renderer instead of the generic layout below, built entirely
// from measurements taken off that reference (font, sizes, exact label
// text incl. its literal padding spaces, line positions, border, and the
// physical label size of 87.9mm x 96.0mm, which is notably not the 4x3in
// size the other three label types use). See docs/modules/labels.md for
// the full measurement method. Deliberately scoped to this one label type
// — the other three (Under Test, In-process, Finished Product) were not
// part of the request and keep the original brand-styled layout.
//
// Font: the reference specifies Calibri (bold, every run) throughout.
// Calibri itself isn't licensed for redistribution, so this embeds Carlito
// — metrically identical, OFL-1.1 licensed, and what LibreOffice actually
// substitutes for Calibri (confirmed: it's what rendered the reference PDF
// used to take the measurements below) — see lib/fonts/carlito-bold.ts.
//
// Company name/address text: the reference's own text for this has an
// apparent copy/paste artifact — "Atharva Nature Healthcare Pvt,Ltd.Wagholi"
// on one line and "Pune" alone on the next (comma instead of period, no
// space, address run onto the name line). Rather than reproduce that
// glitch, this uses the app's canonical COMPANY_NAME / COMPANY_ADDRESS
// constants (same ones the rest of the app's PDFs use) in the same
// two-line position/font/size — flagging this as a deliberate deviation
// from the literal reference text, not an oversight.
const RM_WIDTH_MM = 87.9;
const RM_HEIGHT_MM = 96.0;
const RM_LEFT_PAD_MM = 2.0;

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

// Y position (mm from top) of each field line's text baseline, in the same
// order label-picker.tsx builds the approved_rm fields array.
const RM_FIELD_Y_MM = [28.89, 36.27, 43.12, 50.63, 57.48, 64.65, 72.22, 79.02, 86.57];

function downloadApprovedRmLabel(fields: LabelField[], filename: string) {
  const doc = new jsPDF({ unit: "mm", format: [RM_WIDTH_MM, RM_HEIGHT_MM] });
  doc.addFileToVFS("Carlito-Bold.ttf", CARLITO_BOLD_TTF_BASE64);
  doc.addFont("Carlito-Bold.ttf", "Carlito", "bold");
  doc.setFont("Carlito", "bold");
  doc.setTextColor(0, 0, 0);

  // Plain black hairline border, matching the reference (not the brand
  // green/thicker border the other three label types use).
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(0.15, 0.15, RM_WIDTH_MM - 0.3, RM_HEIGHT_MM - 0.3);

  const centerX = RM_WIDTH_MM / 2;

  doc.setFontSize(13);
  doc.text(COMPANY_NAME, centerX, 3.08, { align: "center" });
  doc.text(COMPANY_ADDRESS, centerX, 8.4, { align: "center" });

  // "Mfg. Lic. No. : PD/AYU-111" — the reference renders the label prefix
  // at 13pt and the license number itself at 11pt, both on one line and
  // both on the same baseline, with the pair centered as a unit. jsPDF's
  // text() only centers a single run, so the two runs' widths are measured
  // and centered manually here.
  const mfgPrefix = "Mfg. Lic. No. :";
  const mfgValue = ` ${MFG_LIC_NO}`;
  doc.setFontSize(13);
  const mfgPrefixWidth = doc.getTextWidth(mfgPrefix);
  doc.setFontSize(11);
  const mfgValueWidth = doc.getTextWidth(mfgValue);
  const mfgStartX = centerX - (mfgPrefixWidth + mfgValueWidth) / 2;
  doc.setFontSize(13);
  doc.text(mfgPrefix, mfgStartX, 14.35, { align: "left" });
  doc.setFontSize(11);
  doc.text(mfgValue, mfgStartX + mfgPrefixWidth, 14.35, { align: "left" });

  doc.setFontSize(11);
  doc.text("APPROVED  RAW MATERIAL", centerX, 19.28, { align: "center" });

  fields.forEach((f, i) => {
    const prefix = RM_FIELD_PREFIX[f.label];
    const y = RM_FIELD_Y_MM[i];
    if (prefix === undefined || y === undefined) return; // unexpected field — skip rather than misplace it
    const text = f.value ? `${prefix}  ${f.value}` : prefix;
    doc.text(text, RM_LEFT_PAD_MM, y, { align: "left" });
  });

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

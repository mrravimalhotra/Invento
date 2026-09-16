import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  VerticalAlign,
} from "docx";
import { ATHARVA_LOGO_PNG_BASE64, ATHARVA_LOGO_ASPECT } from "@/lib/atharva-logo";

// Ravi (15 Sept 2026): "Once Batch is in Completed - Awaiting QC, start
// showing link to 'BATCH MANUFACTURING RECORD' as attached in the .docx
// format under Batch Header Section of Finished Product Screen. 'List of
// Raw Material Obtained from store on date' will be same as start date
// of batch," attaching a real sample front page
// ("A.Jatamansi Tail_PR06-26.._front_page.docx" — FP034 / A.Jatamansi
// Tail / PR 06/26, batch size 60.00 Ltr, yield 59.00, yield% 98.33%,
// start 20-Jul-2026, end 29-Jul-2026, two raw materials consumed).
//
// This is the third legacy-document reproduction in this app (after the
// RM and Finish Product Intimation Slips), but a genuinely different
// format from those two — Ravi explicitly asked for ".docx format" here,
// not a PDF, so this uses the `docx` npm package (Packer.toBlob(), same
// client-side-generation architecture as the jsPDF slips: a plain,
// non-"use client" module called from a small client component's
// onClick, no Server Action, no migration, nothing persisted — see
// bmr-download-link.tsx) rather than jsPDF.
//
// Ravi (16 Sept 2026): moved here from
// app/(dashboard)/finished-product/[id]/ to its own Admin-only page and
// relabeled "Batch Mfg. Record- Deprecated," to resolve a naming collision
// with the real, unrelated `/bmr` module — flagged for future removal.
// See bmr-download-link.tsx and this route's page.tsx for the full story.
// Nothing about the document-generation logic below changed.
//
// Inspecting the attached sample's raw XML (not just its rendered PDF —
// LibreOffice's own text extraction reorders text-box content in a
// misleading way) showed its header/summary block is built from Word
// text boxes (duplicated in the XML only because Word stores each shape
// twice — a DrawingML version and a VML fallback, for compatibility with
// older Word versions — not two visually-printed copies; the rendered
// page has exactly one copy of everything). This module reproduces the
// same fields and grouping using plain Word tables instead of
// hand-positioned text boxes: functionally identical in Word/print, and
// far simpler to generate correctly from live data. Flagged to Ravi
// alongside this delivery as a deliberate simplification, not an
// oversight.
export type BmrComponentRow = {
  rmCode: string;
  rmName: string;
  batchNo: string;
  arNumber: string;
  qtyAsPerMfr: string | number;
};

export type BmrData = {
  fpCode: string;
  fpName: string;
  batchNo: string;
  batchSize: string | number;
  unit: string;
  startDate: string;
  endDate: string;
  batchYield: string | number;
  yieldPct: string | number;
  rmObtainedDate: string;
  components: BmrComponentRow[];
};

// Sample text, transcribed verbatim from this document's own text boxes
// ("Mfg.Lic.No.- PD/AYU/111" — no spaces around "Lic.No.", a slash not a
// dash) — kept local rather than shared with the other two slips'
// slightly different transcriptions of the same real letterhead, same
// established precedent (each legacy document reproduces its own sample
// exactly).
const SLIP_COMPANY_NAME = "Atharva Nature Health Care Pvt. Ltd. Wagholi,Pune";
const SLIP_MFG_LIC = "Mfg.Lic.No.- PD/AYU/111";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function qty2(n: string | number): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_CELL_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

// One row of the FP-Code/FP-Name/Batch-No/Batch-Size ⇄ Start/End/Yield/
// Yield% grid — borderless, matching the sample's own plain (no
// gridlines) header block.
function kvRow(leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) {
  const labelCell = (text: string) =>
    new TableCell({
      width: { size: 15, type: WidthType.PERCENTAGE },
      borders: NO_CELL_BORDERS,
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18 })] })],
    });
  const valueCell = (text: string) =>
    new TableCell({
      width: { size: 35, type: WidthType.PERCENTAGE },
      borders: NO_CELL_BORDERS,
      children: [new Paragraph({ children: [new TextRun({ text, size: 18 })] })],
    });
  return new TableRow({
    children: [labelCell(leftLabel), valueCell(leftValue), labelCell(rightLabel), valueCell(rightValue)],
  });
}

function rmHeaderCell(text: string) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: { fill: "FFFFFF" },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 17 })] }),
    ],
  });
}

function rmDataCell(text: string, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.CENTER) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: align, children: [new TextRun({ text, size: 17 })] })],
  });
}

export async function downloadBmrDocx(data: BmrData, filename: string) {
  const logoBytes = base64ToUint8Array(ATHARVA_LOGO_PNG_BASE64);
  const logoWidth = 130;
  const logoHeight = Math.round(logoWidth / ATHARVA_LOGO_ASPECT);

  const letterheadTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_CELL_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            borders: NO_CELL_BORDERS,
            children: [
              new Paragraph({
                children: [new ImageRun({ type: "png", data: logoBytes, transformation: { width: logoWidth, height: logoHeight } })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            borders: NO_CELL_BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: SLIP_COMPANY_NAME, bold: true, size: 24 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const totalMfrQty = data.components.reduce((sum, c) => sum + (parseFloat(String(c.qtyAsPerMfr)) || 0), 0);

  const rmTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          rmHeaderCell("Sr. No."),
          rmHeaderCell("RM Code"),
          rmHeaderCell("RM Name"),
          rmHeaderCell("Batch No"),
          rmHeaderCell("AR No."),
          rmHeaderCell("Qty. as per MFR"),
          rmHeaderCell("Dispensed quantity"),
          rmHeaderCell("Checked By"),
        ],
      }),
      ...data.components.map(
        (c, i) =>
          new TableRow({
            children: [
              rmDataCell(String(i + 1)),
              rmDataCell(c.rmCode),
              rmDataCell(c.rmName, AlignmentType.LEFT),
              rmDataCell(c.batchNo),
              rmDataCell(c.arNumber || "—"),
              rmDataCell(qty2(c.qtyAsPerMfr)),
              rmDataCell(""),
              rmDataCell(""),
            ],
          })
      ),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          letterheadTable,
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 60 },
            children: [new TextRun({ text: "BATCH MANUFACTURING RECORD", bold: true, size: 26 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" } },
            spacing: { after: 200 },
            children: [new TextRun({ text: SLIP_MFG_LIC, size: 18 })],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: NO_CELL_BORDERS,
            rows: [
              kvRow("FP Code", data.fpCode, "Start Date", data.startDate),
              kvRow("FP Name", data.fpName, "End Date", data.endDate),
              kvRow("Batch No", data.batchNo, "Yield", `${qty2(data.batchYield)} ${data.unit}`),
              kvRow("Batch Size", `${qty2(data.batchSize)} ${data.unit}`, "Yield %", `${qty2(data.yieldPct)}%`),
            ],
          }),
          new Paragraph({
            spacing: { before: 260, after: 100 },
            children: [
              new TextRun({ text: "List of Raw Material Obtained from store on date: - ", bold: true, size: 18 }),
              new TextRun({ text: data.rmObtainedDate, size: 18 }),
            ],
          }),
          rmTable,
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 120, after: 260 },
            children: [
              new TextRun({ text: "QTY  ", bold: true, size: 18 }),
              new TextRun({ text: qty2(totalMfrQty), size: 18 }),
            ],
          }),
          new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Production Chemist", size: 18 })] }),
          new Paragraph({ children: [new TextRun({ text: "Date & Sign", size: 18 })] }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

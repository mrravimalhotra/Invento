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
  Header,
  Footer,
  PageNumber,
} from "docx";
import { ATHARVA_LOGO_PNG_BASE64, ATHARVA_LOGO_ASPECT } from "@/lib/atharva-logo";

// Ravi (16 Sept 2026): "Print MFR option should give me .docx document in
// attached format. It should pick up data already entered as part of MFR
// and recipe and print the MFR in attached format" — attaching a real
// sample "Master Formula Record" (A.Jatamansi_Tail.docx): company
// letterhead repeated in a true Word header (not inlined per-page like
// the BMR download's letterhead table), a Composition/Manufacturing
// Formula section (Sr.No/Ingredients/Botanical Name/Qty), a REMARK line,
// the Manufacturing Procedure section (Sr.No/Stage/OPERATION, see
// 0048_mfr_procedure.sql/EditProcedureForm — this is exactly the data
// that feature now stores), a closing yield line folded into the last
// table row, and a "Page X of Y" footer. Confirmed via AskUserQuestion
// before building:
//   - The sample's closing "Label Specimen" section (a photo of the
//     physical product label) is omitted — nothing in the app stores a
//     label image anywhere, and adding that is its own separate feature.
//   - "Print MFR" becomes a direct one-click .docx download (same
//     one-click pattern as the Finished Product screen's existing BMR
//     .docx download, bmr-docx.ts) rather than opening the existing
//     /mfr/[id]/report preview page first — that page and its PDF
//     download are left exactly as they are, just no longer linked from
//     this button.
//   - No Prepared/Checked/Approved sign-off block — the sample doesn't
//     have one, and this reproduces the sample exactly rather than
//     adding to it.
//
// CORRECTION (16 Sept 2026, same day): Ravi's first pass at this only
// reproduced the sample's header/footer TEXT — "MFR is not printing in
// correct format. Pls take reference of attached again. Use similar
// Logo, color scheme, header, footer etc," re-attaching the sample.
// Inspecting that re-attached copy's raw XML (not just its rendered
// preview) directly, several things the first pass missed:
//   - The header has the real ATHARVA logo as an embedded image (a
//     drawing in header1.xml, not just text) — the exact same logo
//     already used elsewhere in this app (lib/atharva-logo.ts, extracted
//     for the RM Intimation Slip and reused by bmr-docx.ts), just never
//     placed in a real Word Header before. Reused directly rather than
//     re-extracting a duplicate asset.
//   - The FOOTER (not the body — it repeats identically on every page,
//     confirmed via python-docx's section.footer.tables) has a blank
//     4-row/5-column sign-off table (blank "Name"/"Designation"/"Sign."/
//     "Date" columns against "Prepared by"/"Checked by"/"Approved by"
//     rows) above the "Page X of Y" line, with a light shading fill
//     (`w:shd w:fill="EEECE1"`) on the header row. This directly reverses
//     the "no sign-off block" decision above — that decision was made
//     against an earlier copy of the same-named sample that didn't have
//     one; this is the corrected, authoritative reference now.
//   - The font split, confirmed by diffing rFonts declarations across
//     header1.xml/document.xml/footer1.xml: the HEADER is explicitly
//     Arial (`w:rFonts w:ascii="Arial"`), while the body and footer are
//     both explicitly Times New Roman — not one font throughout. Applied
//     here as Times New Roman as the whole document's default (covers
//     body + footer), with Arial set per-run only on the three header
//     lines. The company name is left its default color (no explicit
//     `w:color` in the header XML — plain black/theme text), not this
//     app's brand green: an earlier version of this fix colored it green
//     to match the jsPDF letterheads' convention, but the actual sample
//     is plain black and "similar" means matching what's really there.
//
// Same architecture as bmr-docx.ts: a plain, non-"use client" module
// using the `docx` npm package's Packer.toBlob() client-side, no Server
// Action, no migration, nothing persisted.
//
// Botanical Name column: items.botanical_alias already existed in the
// schema (added well before this feature, used on Item Master's own
// screens) and just wasn't surfaced here before — no new column needed.
export type MfrFormulaLine = { ingredient: string; botanicalName: string | null; qty: string | number; unit: string };
export type MfrProcedureStepRow = { stage: string; operation: string };

export type MfrDocxData = {
  productName: string;
  batchSizeQty: string | number;
  batchSizeUnit: string;
  formulaLines: MfrFormulaLine[];
  procedureIntro: string | null;
  procedureSteps: MfrProcedureStepRow[];
  theoreticalYieldPct: string | number | null;
  permissibleYieldPct: string | number | null;
};

// Transcribed verbatim from the sample's own header/footer (its exact
// casing, spacing, and "Mfg. Lic. No. - PD/AYU -111" wording differ
// slightly from lib/pdf.ts's differently-cased versions used elsewhere)
// — same "each legacy document reproduces its own sample exactly, kept
// local rather than shared" precedent bmr-docx.ts established.
const DOC_COMPANY_NAME = "ATHARVA NATURE HEALTHCARE PVT. LTD.";
const DOC_MFG_LIC = "Mfg. Lic. No. - PD/AYU -111";
const DOC_EMAIL_WEB = "E mail : aapwagholi@gmail.com  www.atharva-ayurved.com";
// Header-only font (the rest of the document defaults to Times New Roman
// — see the styles.default.document.run below and the CORRECTION comment
// above for how this was confirmed against the sample's raw XML).
const HEADER_FONT = "Arial";
// Footer sign-off table's header row shading, transcribed from the
// sample's own `w:shd w:fill="EEECE1"`.
const FOOTER_HEADER_SHADING = { fill: "EEECE1" };

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_CELL_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;
const CELL_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function qty(n: string | number): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(num) ? String(num) : String(n);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function headerCell(text: string, widthPct: number, shaded = false) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    shading: shaded ? FOOTER_HEADER_SHADING : undefined,
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 20 })] }),
    ],
  });
}

function dataCell(text: string, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) {
  // Operation/Ingredient text can contain literal newlines (e.g. the
  // Agni/Fena/Varti Pariksha sub-lines) — split into one Paragraph per
  // line within the same cell, same as multi-paragraph cells elsewhere.
  const lines = text.split("\n");
  return new TableCell({
    borders: CELL_BORDERS,
    children: lines.map((line) => new Paragraph({ alignment: align, children: [new TextRun({ text: line, size: 20 })] })),
  });
}

export async function downloadMfrDocx(data: MfrDocxData, filename: string) {
  const logoBytes = base64ToUint8Array(ATHARVA_LOGO_PNG_BASE64);
  const logoWidth = 95;
  const logoHeight = Math.round(logoWidth / ATHARVA_LOGO_ASPECT);

  // Logo left, company text block right — same borderless-table layout
  // bmr-docx.ts's letterheadTable uses, just with three stacked lines
  // instead of one, and living in a real Header (repeats on every page)
  // rather than inlined once per body.
  const header = new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_CELL_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                borders: NO_CELL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    children: [new ImageRun({ type: "png", data: logoBytes, transformation: { width: logoWidth, height: logoHeight } })],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 80, type: WidthType.PERCENTAGE },
                borders: NO_CELL_BORDERS,
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ children: [new TextRun({ text: DOC_COMPANY_NAME, bold: true, size: 26, font: HEADER_FONT })] }),
                  new Paragraph({ children: [new TextRun({ text: DOC_MFG_LIC, bold: true, size: 20, font: HEADER_FONT })] }),
                  new Paragraph({ children: [new TextRun({ text: DOC_EMAIL_WEB, size: 20, font: HEADER_FONT })] }),
                ],
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } }, children: [] }),
    ],
  });

  // Blank sign-off table (filled in by hand on a printed copy — nothing
  // in the app captures Name/Designation/Sign./Date data to pre-fill
  // here) + "Page X of Y", both repeating on every page via a real
  // Footer, matching the corrected reference exactly.
  const footer = new Footer({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              headerCell("", 15, true),
              headerCell("Name", 28, true),
              headerCell("Designation", 22, true),
              headerCell("Sign.", 15, true),
              headerCell("Date", 20, true),
            ],
          }),
          ...["Prepared by", "Checked by", "Approved by"].map(
            (label) =>
              new TableRow({
                children: [dataCell(label), dataCell(""), dataCell(""), dataCell(""), dataCell("")],
              })
          ),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 60 },
        children: [
          new TextRun({ text: "Page ", size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], bold: true, size: 18 }),
          new TextRun({ text: " of ", size: 18 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], bold: true, size: 18 }),
        ],
      }),
    ],
  });

  const formulaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [headerCell("Sr. No.", 10), headerCell("Ingredients", 30), headerCell("Botanical Name", 30), headerCell("Qty", 30)],
      }),
      ...data.formulaLines.map(
        (l, i) =>
          new TableRow({
            children: [
              dataCell(String(i + 1), AlignmentType.CENTER),
              dataCell(l.ingredient),
              dataCell(l.botanicalName || "—"),
              dataCell(`${qty(l.qty)} ${l.unit}`, AlignmentType.CENTER),
            ],
          })
      ),
    ],
  });

  const yieldRow = new TableRow({
    children: [
      dataCell(""),
      dataCell(data.theoreticalYieldPct != null ? `Theoretical Yield = ${qty(data.theoreticalYieldPct)} %` : ""),
      dataCell(data.permissibleYieldPct != null ? `Permissible yield = NLT ${qty(data.permissibleYieldPct)} %` : ""),
    ],
  });

  const procedureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [headerCell("Sr.No", 10), headerCell("Stage", 25), headerCell("OPERATION", 65)] }),
      ...data.procedureSteps.map(
        (s, i) =>
          new TableRow({ children: [dataCell(String(i + 1), AlignmentType.CENTER), dataCell(s.stage), dataCell(s.operation)] })
      ),
      ...(data.theoreticalYieldPct != null || data.permissibleYieldPct != null ? [yieldRow] : []),
    ],
  });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: "Master Formula Record", bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: data.productName, bold: true, size: 28 })],
    }),
    new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "Composition:", bold: true, size: 28 })] }),
    ...data.formulaLines.map((l) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: l.ingredient, size: 28 })] })),
    new Paragraph({
      spacing: { before: 160, after: 100 },
      children: [new TextRun({ text: "Manufacturing Formula", bold: true, size: 28 })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: `Batch Size –${qty(data.batchSizeQty)} ${data.batchSizeUnit}`, bold: true, size: 24 })],
    }),
    formulaTable,
    new Paragraph({
      spacing: { before: 160, after: 200 },
      children: [
        new TextRun({ text: "REMARK: ", bold: true, size: 24 }),
        new TextRun({
          text: "Whenever there is a change in batch size, all ingredients should be taken in proportionate quantity of the batch size.",
          size: 24,
        }),
      ],
    }),
  ];

  // Whole section skipped — not just left empty under its own heading —
  // for an MFR with no procedure entered at all yet, same "don't print an
  // empty heading" rule the on-screen report/PDF already follow.
  const hasProcedureContent =
    !!data.procedureIntro || data.procedureSteps.length > 0 || data.theoreticalYieldPct != null || data.permissibleYieldPct != null;

  if (hasProcedureContent) {
    children.push(
      new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "MANUFACTURING PROCEDURE", bold: true, size: 26 })] })
    );
    if (data.procedureIntro) {
      children.push(
        new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: data.procedureIntro, bold: true, size: 24 })] })
      );
    }
    if (data.procedureSteps.length > 0 || data.theoreticalYieldPct != null || data.permissibleYieldPct != null) {
      children.push(procedureTable);
    }
  }

  const doc = new Document({
    // Times New Roman throughout (body + footer), matching the
    // reference's own explicit `w:rFonts w:ascii="Times New Roman"` on
    // both — Arial is layered on top per-run only for the three header
    // lines above, matching the header's own separate `w:rFonts
    // w:ascii="Arial"`.
    styles: { default: { document: { run: { font: "Times New Roman" } } } },
    sections: [
      {
        properties: {},
        headers: { default: header },
        footers: { default: footer },
        children,
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

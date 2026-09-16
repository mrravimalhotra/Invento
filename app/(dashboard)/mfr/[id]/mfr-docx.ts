import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  VerticalAlign,
  Header,
  Footer,
  PageNumber,
} from "docx";

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

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;
const CELL_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function qty(n: string | number): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(num) ? String(num) : String(n);
}

function headerCell(text: string, widthPct: number) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
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
  const header = new Header({
    children: [
      new Paragraph({ children: [new TextRun({ text: DOC_COMPANY_NAME, bold: true, size: 26 })] }),
      new Paragraph({ children: [new TextRun({ text: DOC_MFG_LIC, bold: true, size: 20 })] }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
        children: [new TextRun({ text: DOC_EMAIL_WEB, size: 20 })],
      }),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
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

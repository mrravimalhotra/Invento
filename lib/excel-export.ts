import ExcelJS from "exceljs";

// Builds and downloads an .xlsx in the browser (29 Sept 2026, export decision
// (c)). One "data" sheet — header row, then one row per record, nothing else,
// so it sorts, filters and pivots cleanly — and a second "About this export"
// sheet with who/when/what filter.

export type ExcelColumn = {
  header: string;
  type: "text" | "number" | "date" | "datetime";
  decimals: number;
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8F0EA" },
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// A date-only string ("2026-09-29") or a timestamp becomes a real Excel date.
// Excel dates carry no time zone, so a timestamp is written as its India wall
// clock time (what every screen in the app shows).
export function toExcelDate(value: string, withTime: boolean): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return null;
  const ist = new Date(t.getTime() + IST_OFFSET_MS);
  return withTime
    ? ist
    : new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

function numberFormat(decimals: number): string {
  if (decimals <= 0) return "#,##0";
  if (decimals === 2) return "#,##0.00";
  return `#,##0.${"#".repeat(decimals)}`;
}

// Sheet names: at most 31 characters, none of  \ / ? * [ ] :
export function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Data";
}

export async function buildWorkbook({
  sheetName,
  columns,
  rows,
  about,
}: {
  sheetName: string;
  columns: ExcelColumn[];
  rows: (string | number | null)[][];
  about: [string, string][];
}): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Invento";
  const sheet = wb.addWorksheet(safeSheetName(sheetName));

  const head = sheet.addRow(columns.map((c) => c.header));
  head.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle" };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const widths = columns.map((c) => c.header.length + 4);
  for (const r of rows) {
    const cells = r.map((v, i) => {
      const col = columns[i];
      if (v === null || v === undefined || v === "") return null;
      if (col.type === "number") {
        const n = typeof v === "number" ? v : parseFloat(String(v));
        return Number.isNaN(n) ? String(v) : n;
      }
      if (col.type === "date" || col.type === "datetime") {
        return toExcelDate(String(v), col.type === "datetime") ?? String(v);
      }
      return String(v);
    });
    const row = sheet.addRow(cells);
    cells.forEach((c, i) => {
      const len = c instanceof Date ? 16 : String(c ?? "").length;
      if (len + 2 > widths[i]) widths[i] = Math.min(len + 2, 60);
      const col = columns[i];
      const cell = row.getCell(i + 1);
      if (col.type === "number" && typeof c === "number") {
        cell.numFmt = numberFormat(col.decimals);
        cell.alignment = { horizontal: "right" };
      } else if (col.type === "date" && c instanceof Date) {
        cell.numFmt = "dd-mm-yyyy";
        cell.alignment = { horizontal: "left" };
      } else if (col.type === "datetime" && c instanceof Date) {
        cell.numFmt = "dd-mm-yyyy hh:mm";
        cell.alignment = { horizontal: "left" };
      }
    });
  }
  columns.forEach((_, i) => {
    sheet.getColumn(i + 1).width = Math.max(10, Math.min(widths[i], 60));
  });
  if (columns.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }

  const info = wb.addWorksheet("About this export");
  info.columns = [{ width: 16 }, { width: 90 }];
  for (const [label, value] of about) {
    const row = info.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  return wb;
}

export async function downloadExcel(args: {
  sheetName: string;
  filename: string;
  columns: ExcelColumn[];
  rows: (string | number | null)[][];
  about: [string, string][];
}): Promise<void> {
  const wb = await buildWorkbook(args);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = args.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

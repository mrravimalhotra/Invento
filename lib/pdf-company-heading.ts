import type { jsPDF } from "jspdf";
import { ATHARVA_LOGO_PNG_BASE64, ATHARVA_LOGO_ASPECT } from "@/lib/atharva-logo";
import { addressAndLicenceLine, getCompany } from "@/lib/company";

// The company heading used on printed PDFs (FB-0046, 4 Oct 2026): the logo,
// the company name directly below it, then the address and licence number,
// all centred. The name, address and licence come from the saved company
// details (Admin -> Company Details), so changing them there changes every
// document. Returns the y (mm) just below the heading.
export function drawCompanyHeading(
  doc: jsPDF,
  opts: {
    centerX: number;
    top: number;
    logoWidth: number;
    nameSizePt?: number;
    lineSizePt?: number;
    nameColor?: [number, number, number];
    lineColor?: [number, number, number];
  }
): number {
  const c = getCompany();
  const { centerX, top, logoWidth } = opts;
  const nameSize = opts.nameSizePt ?? 12;
  const lineSize = opts.lineSizePt ?? 9;
  const nameColor = opts.nameColor ?? [0, 0, 0];
  const lineColor = opts.lineColor ?? [60, 60, 60];

  const logoHeight = logoWidth / ATHARVA_LOGO_ASPECT;
  doc.addImage(ATHARVA_LOGO_PNG_BASE64, "PNG", centerX - logoWidth / 2, top, logoWidth, logoHeight);

  let y = top + logoHeight + 4.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(nameSize);
  doc.setTextColor(nameColor[0], nameColor[1], nameColor[2]);
  doc.text(c.name, centerX, y, { align: "center" });

  y += 4.8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(lineSize);
  doc.setTextColor(lineColor[0], lineColor[1], lineColor[2]);
  doc.text(addressAndLicenceLine(c), centerX, y, { align: "center" });
  return y;
}

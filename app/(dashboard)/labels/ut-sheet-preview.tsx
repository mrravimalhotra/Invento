"use client";

// On-screen preview + JPEG-export source for the Under Test label sheet
// (19 Sept 2026: "do same for under test labels"). Same approach as
// rm-sheet-preview.tsx / fp-ip-sheet-preview.tsx: reuses
// generate-label-pdf.ts's exported layout constants and buildUtLines()
// rather than re-deriving positions here.
//
// The one real difference from fp-ip-sheet-preview.tsx: Under Test mixes
// font weights (bold company-name/title lines, regular everywhere else),
// so this embeds and loads both Liberation Serif weights rather than one.
import { forwardRef, useEffect, useMemo } from "react";
import { jsPDF } from "jspdf";
import {
  UT_PAGE_WIDTH_MM,
  UT_PAGE_HEIGHT_MM,
  UT_GRID_COLS,
  UT_GRID_ROWS,
  UT_GRID_ORIGIN_X_MM,
  UT_CELL_WIDTH_MM,
  UT_CELL_HEIGHT_MM,
  UT_GRID_ORIGIN_Y_MM,
  UT_LEFT_PAD_MM,
  UT_MFGLIC_INDENT_MM,
  UT_FONT_SIZE_PT,
  buildUtLines,
  type LabelField,
} from "./generate-label-pdf";
import { LIBERATION_SERIF_BOLD_TTF_BASE64 } from "@/lib/fonts/liberation-serif-bold";
import { LIBERATION_SERIF_REGULAR_TTF_BASE64 } from "@/lib/fonts/liberation-serif-regular";

// Same rationale as loadRmCarlitoFont/loadFpIpLiberationSerifFont — avoid
// the font-loading race that caused Ravi's original "letters going out of
// border" bug on the RM label by explicitly awaiting both weights via the
// Font Loading API rather than relying on a passive @font-face.
let utFontLoadPromise: Promise<void> | null = null;
export function loadUtLiberationSerifFonts(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  if (!utFontLoadPromise) {
    utFontLoadPromise = (async () => {
      try {
        const [bold, regular] = await Promise.all([
          new FontFace("UtLiberationSerif", `url(data:font/ttf;base64,${LIBERATION_SERIF_BOLD_TTF_BASE64})`, {
            weight: "700",
            style: "normal",
          }).load(),
          new FontFace("UtLiberationSerif", `url(data:font/ttf;base64,${LIBERATION_SERIF_REGULAR_TTF_BASE64})`, {
            weight: "400",
            style: "normal",
          }).load(),
        ]);
        document.fonts.add(bold);
        document.fonts.add(regular);
      } catch {
        // Best-effort — the passive @font-face declarations below still
        // apply as a fallback if this ever fails.
      }
    })();
  }
  return utFontLoadPromise;
}

// ~US Legal at 96 CSS-px/inch (215.9mm * 96/25.4) — same base-resolution/
// display-scaling approach as the other two preview components.
export const UT_PREVIEW_WIDTH_PX = 816;
const PX_PER_MM = UT_PREVIEW_WIDTH_PX / UT_PAGE_WIDTH_MM;
export const UT_PREVIEW_HEIGHT_PX = UT_PAGE_HEIGHT_MM * PX_PER_MM;

function ptToPx(sizePt: number) {
  return sizePt * 0.3528 * PX_PER_MM;
}

const BASELINE_OFFSET_FACTOR = 0.78;

function useUtMeasurer() {
  return useMemo(() => {
    const doc = new jsPDF({ unit: "mm" });
    doc.addFileToVFS("LiberationSerif-Bold.ttf", LIBERATION_SERIF_BOLD_TTF_BASE64);
    doc.addFont("LiberationSerif-Bold.ttf", "LiberationSerif", "bold");
    doc.addFileToVFS("LiberationSerif-Regular.ttf", LIBERATION_SERIF_REGULAR_TTF_BASE64);
    doc.addFont("LiberationSerif-Regular.ttf", "LiberationSerif", "normal");
    doc.setFont("LiberationSerif", "normal");
    return doc;
  }, []);
}

export const UtSheetPreview = forwardRef<HTMLDivElement, { fields: LabelField[] }>(function UtSheetPreview(
  { fields },
  ref
) {
  const measurer = useUtMeasurer();
  const lines = useMemo(() => buildUtLines(fields, measurer), [fields, measurer]);
  useEffect(() => {
    void loadUtLiberationSerifFonts();
  }, []);

  const cellWpx = UT_CELL_WIDTH_MM * PX_PER_MM;
  const cellHpx = UT_CELL_HEIGHT_MM * PX_PER_MM;
  const leftPadPx = UT_LEFT_PAD_MM * PX_PER_MM;
  const mfgLicPx = (UT_LEFT_PAD_MM + UT_MFGLIC_INDENT_MM) * PX_PER_MM;

  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < UT_GRID_ROWS; row++) {
    for (let col = 0; col < UT_GRID_COLS; col++) {
      cells.push({
        x: (UT_GRID_ORIGIN_X_MM + col * UT_CELL_WIDTH_MM) * PX_PER_MM,
        y: (UT_GRID_ORIGIN_Y_MM + row * UT_CELL_HEIGHT_MM) * PX_PER_MM,
      });
    }
  }

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: UT_PREVIEW_WIDTH_PX,
        height: UT_PREVIEW_HEIGHT_PX,
        background: "#fff",
        color: "#000",
        fontFamily: "UtLiberationSerif, 'Times New Roman', serif",
      }}
    >
      <style>{`
        @font-face {
          font-family: "UtLiberationSerif";
          src: url(data:font/ttf;base64,${LIBERATION_SERIF_BOLD_TTF_BASE64}) format("truetype");
          font-weight: 700;
          font-style: normal;
        }
        @font-face {
          font-family: "UtLiberationSerif";
          src: url(data:font/ttf;base64,${LIBERATION_SERIF_REGULAR_TTF_BASE64}) format("truetype");
          font-weight: 400;
          font-style: normal;
        }
      `}</style>
      {cells.map((cell, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: cell.x,
            top: cell.y,
            width: cellWpx,
            height: cellHpx,
            border: "1px solid #000",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {lines.map((line, li) => {
            const sizePt = "runs" in line ? line.runs[0].sizePt : UT_FONT_SIZE_PT;
            const topPx = line.yMm * PX_PER_MM - ptToPx(sizePt) * BASELINE_OFFSET_FACTOR;
            if ("runs" in line) {
              return (
                <div
                  key={li}
                  style={{
                    position: "absolute",
                    left: leftPadPx,
                    top: topPx,
                    width: cellWpx - leftPadPx,
                    display: "flex",
                    alignItems: "baseline",
                    fontWeight: 400,
                    whiteSpace: "pre",
                  }}
                >
                  {line.runs.map((run, ri) => (
                    <span key={ri} style={{ fontSize: ptToPx(run.sizePt) }}>
                      {run.text}
                    </span>
                  ))}
                </div>
              );
            }
            if (line.x === "center") {
              return (
                <div
                  key={li}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: topPx,
                    width: cellWpx,
                    display: "flex",
                    justifyContent: "center",
                    fontWeight: line.bold ? 700 : 400,
                    whiteSpace: "pre",
                  }}
                >
                  <span style={{ fontSize: ptToPx(UT_FONT_SIZE_PT) }}>{line.text}</span>
                </div>
              );
            }
            const left = line.x === "mfglic-indent" ? mfgLicPx : leftPadPx;
            return (
              <div
                key={li}
                style={{
                  position: "absolute",
                  left,
                  top: topPx,
                  width: cellWpx - left,
                  fontWeight: line.bold ? 700 : 400,
                  whiteSpace: "pre",
                }}
              >
                <span style={{ fontSize: ptToPx(UT_FONT_SIZE_PT) }}>{line.text}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});

"use client";

// On-screen preview + JPEG-export source for the Approved Raw Material
// label sheet (19 Sept 2026: "print label should same format, same size
// for both pdf and jpg, 6 labels per page as per template"). Deliberately
// reuses generate-label-pdf.ts's exported layout constants and
// buildRmLines() rather than re-deriving positions here, so the PDF and
// this HTML/JPEG rendering can't drift apart into two different "pixel
// perfect" layouts.
//
// Unlike the PDF (built in physical mm via jsPDF), this renders at a fixed
// on-screen pixel width and scales every mm measurement into px against
// that width — the exported JPEG's absolute on-screen size doesn't need to
// literally be A4; what "same format, same size" means for a raster image
// is the same 6-up grid, aspect ratio and field layout, which this
// guarantees since it's driven by the identical constants. html2canvas's
// `scale` option (see label-picker.tsx) upscales the actual capture for
// print-usable resolution regardless of the on-screen preview size.
//
// The embedded Carlito TTF (see lib/fonts/carlito-bold.ts, the same
// Calibri-substitute the PDF embeds) is loaded here as a CSS @font-face
// from the same base64 data, so the JPEG uses the identical typeface as
// the PDF rather than a browser default.
import { forwardRef } from "react";
import {
  RM_PAGE_WIDTH_MM,
  RM_PAGE_HEIGHT_MM,
  RM_GRID_COLS,
  RM_GRID_ROWS,
  RM_GRID_ORIGIN_X_MM,
  RM_GRID_ORIGIN_Y_MM,
  RM_CELL_WIDTH_MM,
  RM_CELL_HEIGHT_MM,
  RM_LEFT_PAD_MM,
  buildRmLines,
  type LabelField,
} from "./generate-label-pdf";
import { CARLITO_BOLD_TTF_BASE64 } from "@/lib/fonts/carlito-bold";

// ~A4 at 96 CSS-px/inch (210mm * 96/25.4) — an arbitrary but clean base
// resolution; html2canvas's `scale` option (see label-picker.tsx) upscales
// the actual JPEG export well past this, and the on-screen card displays
// this node scaled *down* via a wrapping CSS transform rather than
// rendering it at this full size — see RM_PREVIEW_WIDTH_PX's usage there.
export const RM_PREVIEW_WIDTH_PX = 794;
const PX_PER_MM = RM_PREVIEW_WIDTH_PX / RM_PAGE_WIDTH_MM;
export const RM_PREVIEW_HEIGHT_PX = RM_PAGE_HEIGHT_MM * PX_PER_MM;

// pt -> px at this preview's scale (1pt = 0.3528mm).
function ptToPx(sizePt: number) {
  return sizePt * 0.3528 * PX_PER_MM;
}

// Approximate distance from a line's CSS `top` to its visual text baseline,
// as a fraction of font size — close enough for a raster preview/export;
// the PDF (measured and numerically verified against the reference) is the
// source of print-accurate positioning.
const BASELINE_OFFSET_FACTOR = 0.78;

export const RmSheetPreview = forwardRef<HTMLDivElement, { fields: LabelField[] }>(function RmSheetPreview(
  { fields },
  ref
) {
  const lines = buildRmLines(fields);
  const cellWpx = RM_CELL_WIDTH_MM * PX_PER_MM;
  const cellHpx = RM_CELL_HEIGHT_MM * PX_PER_MM;
  const leftPadPx = RM_LEFT_PAD_MM * PX_PER_MM;

  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < RM_GRID_ROWS; row++) {
    for (let col = 0; col < RM_GRID_COLS; col++) {
      cells.push({
        x: (RM_GRID_ORIGIN_X_MM + col * RM_CELL_WIDTH_MM) * PX_PER_MM,
        y: (RM_GRID_ORIGIN_Y_MM + row * RM_CELL_HEIGHT_MM) * PX_PER_MM,
      });
    }
  }

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: RM_PREVIEW_WIDTH_PX,
        height: RM_PREVIEW_HEIGHT_PX,
        background: "#fff",
        color: "#000",
        fontFamily: "RmCarlito, Calibri, sans-serif",
        fontWeight: 700,
      }}
    >
      <style>{`
        @font-face {
          font-family: "RmCarlito";
          src: url(data:font/ttf;base64,${CARLITO_BOLD_TTF_BASE64}) format("truetype");
          font-weight: 700;
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
          {lines.map((line, li) => (
            <div
              key={li}
              style={{
                position: "absolute",
                left: line.align === "center" ? 0 : leftPadPx,
                top: line.yMm * PX_PER_MM - ptToPx(line.runs[0].sizePt) * BASELINE_OFFSET_FACTOR,
                width: line.align === "center" ? cellWpx : cellWpx - leftPadPx,
                display: "flex",
                justifyContent: line.align === "center" ? "center" : "flex-start",
                alignItems: "baseline",
                whiteSpace: "pre",
              }}
            >
              {line.runs.map((run, ri) => (
                <span key={ri} style={{ fontSize: ptToPx(run.sizePt) }}>
                  {run.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

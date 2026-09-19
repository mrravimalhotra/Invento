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
import { forwardRef, useEffect, useMemo } from "react";
import { jsPDF } from "jspdf";
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

// The CSS @font-face below is declared but browsers only start downloading
// a data: URI font lazily, once layout actually needs it to paint text —
// there's no guarantee it's ready by the time "Download JPEG" fires
// html2canvas, and a race here is exactly what caused the bug Ravi hit
// ("letters going out of border"): with Carlito not yet loaded,
// html2canvas fell back to a generic bold sans-serif for the capture,
// which measures ~2.6mm wider than Carlito for a typical field line —
// just enough to push text past the 87.9mm cell's right edge even though
// both the PDF and this preview's own layout math say it fits. This
// loader uses the explicit CSS Font Loading API instead of the passive
// @font-face so callers can actually await completion; the promise is
// cached so repeated calls (component mount, then again right before
// capture) share one load.
let rmFontLoadPromise: Promise<void> | null = null;
export function loadRmCarlitoFont(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  if (!rmFontLoadPromise) {
    rmFontLoadPromise = (async () => {
      try {
        const face = new FontFace("RmCarlito", `url(data:font/ttf;base64,${CARLITO_BOLD_TTF_BASE64})`, {
          weight: "700",
          style: "normal",
        });
        const loaded = await face.load();
        document.fonts.add(loaded);
      } catch {
        // Best-effort — the passive @font-face declaration is still in
        // place as a fallback if this ever fails.
      }
    })();
  }
  return rmFontLoadPromise;
}

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

// A throwaway jsPDF instance used only to measure text (never rendered to
// a page or saved) — buildRmLines() uses it to decide whether a field's
// value needs to shrink or truncate to fit, via the exact same font
// metrics the real PDF export measures with, so this preview and the PDF
// make identical shrink/truncate decisions for the same data.
function useRmMeasurer() {
  return useMemo(() => {
    const doc = new jsPDF({ unit: "mm" });
    doc.addFileToVFS("Carlito-Bold.ttf", CARLITO_BOLD_TTF_BASE64);
    doc.addFont("Carlito-Bold.ttf", "Carlito", "bold");
    doc.setFont("Carlito", "bold");
    return doc;
  }, []);
}

export const RmSheetPreview = forwardRef<HTMLDivElement, { fields: LabelField[] }>(function RmSheetPreview(
  { fields },
  ref
) {
  const measurer = useRmMeasurer();
  const lines = useMemo(() => buildRmLines(fields, measurer), [fields, measurer]);
  // Start loading Carlito as soon as this preview is on screen, well
  // before the user clicks "Download JPEG" — label-picker.tsx also awaits
  // loadRmCarlitoFont() right before capture as a backstop, but starting
  // it here means it's very likely already resolved by then.
  useEffect(() => {
    void loadRmCarlitoFont();
  }, []);
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

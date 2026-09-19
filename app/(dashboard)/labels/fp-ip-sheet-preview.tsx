"use client";

// On-screen preview + JPEG-export source for the Finished Product and
// In-process label sheets (19 Sept 2026: "Apply similar formatting for
// Finished Product & In Process Labels. Use attached as template"). Same
// approach as rm-sheet-preview.tsx: reuses generate-label-pdf.ts's exported
// layout constants and buildFpIpLines() rather than re-deriving positions
// here, so the PDF and this HTML/JPEG rendering can't drift apart.
//
// One component serves both label types (unlike RM, which is its own
// single type) since Finished Product and In-process are otherwise
// identical in structure — same page, grid, font, column positions — and
// differ only in title text, field list/prefixes and cell height (see the
// `opts` prop, mirroring downloadFpIpLabel's own `opts` in
// generate-label-pdf.ts).
import { forwardRef, useEffect, useMemo } from "react";
import { jsPDF } from "jspdf";
import {
  FPIP_PAGE_WIDTH_MM,
  FPIP_PAGE_HEIGHT_MM,
  FPIP_GRID_COLS,
  FPIP_GRID_ROWS,
  FPIP_GRID_ORIGIN_X_MM,
  FPIP_CELL_WIDTH_MM,
  FPIP_GRID_ORIGIN_Y_MM,
  FPIP_LEFT_PAD_MM,
  FPIP_INDENT_MM,
  FPIP_RIGHT_PAD_MM,
  buildFpIpLines,
  type LabelField,
} from "./generate-label-pdf";
import { LIBERATION_SERIF_BOLD_TTF_BASE64 } from "@/lib/fonts/liberation-serif-bold";

// Same rationale as loadRmCarlitoFont in rm-sheet-preview.tsx: a passive
// CSS @font-face data: URI isn't guaranteed loaded before html2canvas
// fires, which is exactly the race that caused Ravi's "letters going out
// of border" bug on the RM label. Using the explicit Font Loading API and
// awaiting it (component mount, then again right before capture) avoids
// repeating that bug here from the start.
let fpIpFontLoadPromise: Promise<void> | null = null;
export function loadFpIpLiberationSerifFont(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  if (!fpIpFontLoadPromise) {
    fpIpFontLoadPromise = (async () => {
      try {
        const face = new FontFace(
          "FpIpLiberationSerif",
          `url(data:font/ttf;base64,${LIBERATION_SERIF_BOLD_TTF_BASE64})`,
          { weight: "700", style: "normal" }
        );
        const loaded = await face.load();
        document.fonts.add(loaded);
      } catch {
        // Best-effort — the passive @font-face declaration below still
        // applies as a fallback if this ever fails.
      }
    })();
  }
  return fpIpFontLoadPromise;
}

// ~US Letter at 96 CSS-px/inch (215.9mm * 96/25.4) — same "arbitrary but
// clean base resolution, scaled down for on-screen display via a wrapper
// transform" approach as RM_PREVIEW_WIDTH_PX in rm-sheet-preview.tsx.
export const FPIP_PREVIEW_WIDTH_PX = 816;
const PX_PER_MM = FPIP_PREVIEW_WIDTH_PX / FPIP_PAGE_WIDTH_MM;
export const FPIP_PREVIEW_HEIGHT_PX = FPIP_PAGE_HEIGHT_MM * PX_PER_MM;

function ptToPx(sizePt: number) {
  return sizePt * 0.3528 * PX_PER_MM;
}

// Same heuristic role as RM's BASELINE_OFFSET_FACTOR — approximate
// distance from a line's CSS `top` to its visual baseline as a fraction of
// font size, good enough for a raster preview/export. The PDF (measured
// and numerically verified against the reference) is the source of
// print-accurate positioning.
const BASELINE_OFFSET_FACTOR = 0.78;

function useFpIpMeasurer() {
  return useMemo(() => {
    const doc = new jsPDF({ unit: "mm" });
    doc.addFileToVFS("LiberationSerif-Bold.ttf", LIBERATION_SERIF_BOLD_TTF_BASE64);
    doc.addFont("LiberationSerif-Bold.ttf", "LiberationSerif", "bold");
    doc.setFont("LiberationSerif", "bold");
    return doc;
  }, []);
}

export type FpIpSheetPreviewProps = {
  fields: LabelField[];
  title: string;
  fieldPrefix: Record<string, string>;
  cellHeightMm: number;
};

export const FpIpSheetPreview = forwardRef<HTMLDivElement, FpIpSheetPreviewProps>(function FpIpSheetPreview(
  { fields, title, fieldPrefix, cellHeightMm },
  ref
) {
  const measurer = useFpIpMeasurer();
  const lines = useMemo(
    () => buildFpIpLines(fields, measurer, { title, fieldPrefix }),
    [fields, measurer, title, fieldPrefix]
  );
  useEffect(() => {
    void loadFpIpLiberationSerifFont();
  }, []);

  const cellWpx = FPIP_CELL_WIDTH_MM * PX_PER_MM;
  const cellHpx = cellHeightMm * PX_PER_MM;
  const leftPadPx = FPIP_LEFT_PAD_MM * PX_PER_MM;
  const indentPx = (FPIP_LEFT_PAD_MM + FPIP_INDENT_MM) * PX_PER_MM;
  const centerIndentPx = (indentPx + (cellWpx - FPIP_RIGHT_PAD_MM * PX_PER_MM)) / 2;

  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < FPIP_GRID_ROWS; row++) {
    for (let col = 0; col < FPIP_GRID_COLS; col++) {
      cells.push({
        x: (FPIP_GRID_ORIGIN_X_MM + col * FPIP_CELL_WIDTH_MM) * PX_PER_MM,
        y: (FPIP_GRID_ORIGIN_Y_MM + row * cellHeightMm) * PX_PER_MM,
      });
    }
  }

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: FPIP_PREVIEW_WIDTH_PX,
        height: FPIP_PREVIEW_HEIGHT_PX,
        background: "#fff",
        color: "#000",
        fontFamily: "FpIpLiberationSerif, 'Times New Roman', serif",
        fontWeight: 700,
      }}
    >
      <style>{`
        @font-face {
          font-family: "FpIpLiberationSerif";
          src: url(data:font/ttf;base64,${LIBERATION_SERIF_BOLD_TTF_BASE64}) format("truetype");
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
          {lines.map((line, li) => {
            const topPx = line.yMm * PX_PER_MM - ptToPx(FPIP_FONT_SIZE_PT_FALLBACK(line)) * BASELINE_OFFSET_FACTOR;
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
                    justifyContent: "flex-start",
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
              );
            }
            if (line.x === "center-indent") {
              // Centered within the indented region (see FPIP_INDENT_MM),
              // not the full cell width — anchor at its measured center
              // and shift back by half the text's own width.
              return (
                <div
                  key={li}
                  style={{
                    position: "absolute",
                    left: centerIndentPx,
                    top: topPx,
                    transform: "translateX(-50%)",
                    whiteSpace: "pre",
                  }}
                >
                  <span style={{ fontSize: ptToPx(line.sizePt) }}>{line.text}</span>
                </div>
              );
            }
            const left = line.x === "left-indent" ? indentPx : leftPadPx;
            return (
              <div
                key={li}
                style={{
                  position: "absolute",
                  left,
                  top: topPx,
                  width: cellWpx - left,
                  whiteSpace: "pre",
                }}
              >
                <span style={{ fontSize: ptToPx(line.sizePt) }}>{line.text}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
});

// Every FP/IP line is FPIP_FONT_SIZE_PT (11pt) — no mixed sizes the way
// RM has — but the line's own `sizePt` (or its first run's) is read here
// rather than a hardcoded constant so this stays correct if that ever
// changes.
function FPIP_FONT_SIZE_PT_FALLBACK(line: { sizePt: number } | { runs: { sizePt: number }[] }): number {
  return "runs" in line ? line.runs[0].sizePt : line.sizePt;
}

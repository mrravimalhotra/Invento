"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Shows a label sheet preview (rendered at its native size) scaled down to fit.
// It is never wider than `maxWidth` (320 px, as before) nor wider than the space
// the page gives it, so on a small phone the page does not scroll sideways
// (25 Oct 2026, Ravi). Proportions are kept; the printed PDF is not affected.
export function ScaledPreview({
  nativeWidth,
  nativeHeight,
  maxWidth = 320,
  children,
}: {
  nativeWidth: number;
  nativeHeight: number;
  maxWidth?: number;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(maxWidth);

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.min(maxWidth, el.clientWidth || maxWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);

  const scale = width / nativeWidth;
  return (
    <div ref={outerRef} className="w-full">
      <div
        className="overflow-hidden rounded-md border-2 border-border shadow-sm"
        style={{ width, height: nativeHeight * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
}

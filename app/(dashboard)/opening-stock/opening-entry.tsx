"use client";

import { useState } from "react";
import type { OpeningKind } from "@/lib/opening-stock/columns";
import { OpeningUploadForm } from "./upload-form";
import { OpeningEntryForm } from "./entry-form";

// Two ways to load the same stock (Ravi, 12 Oct 2026): upload the Excel sheet, or type the rows in
// on the page. Both end in the same checks and the same all-or-nothing load. The typed-in form is
// built the first time it is opened and then kept (just hidden), so rows typed are not lost by
// flipping back to Upload Excel.
export function OpeningEntry({ kind, templateHref }: { kind: OpeningKind; templateHref: string }) {
  const [mode, setMode] = useState<"upload" | "type">("upload");
  const [typedOpened, setTypedOpened] = useState(false);

  function pick(m: "upload" | "type") {
    setMode(m);
    if (m === "type") setTypedOpened(true);
  }
  const tab = (m: "upload" | "type", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => pick(m)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors max-md:min-h-10 ${
        mode === m ? "bg-brand text-white" : "text-foreground hover:bg-black/5"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="How to enter the stock" className="inline-flex w-fit gap-1 rounded-lg border border-border bg-white p-1">
        {tab("upload", "Upload Excel")}
        {tab("type", "Type it in")}
      </div>
      <div hidden={mode !== "upload"}>
        <OpeningUploadForm kind={kind} templateHref={templateHref} />
      </div>
      {typedOpened && (
        <div hidden={mode !== "type"}>
          <OpeningEntryForm kind={kind} />
        </div>
      )}
    </div>
  );
}

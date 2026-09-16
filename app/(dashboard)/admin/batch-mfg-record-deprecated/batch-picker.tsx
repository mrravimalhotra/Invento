"use client";

import { useState } from "react";
import { Select } from "@/components/ui/combobox";
import { BmrDownloadLink } from "./bmr-download-link";
import type { BmrComponentRow } from "./bmr-docx";

export type BmrBatchOption = {
  id: string;
  batchNo: string;
  fpCode: string;
  fpName: string;
  batchSize: string | number;
  unit: string;
  startDate: string;
  endDate: string;
  batchYield: string | number;
  yieldPct: string | number;
  rmObtainedDate: string;
  components: BmrComponentRow[];
};

// Ravi (16 Sept 2026): the FP detail page picked one batch for you (it's
// scoped to a single finished_product_batches row); this Admin page has no
// such context, so it needs its own picker across every eligible batch —
// reusing the app's shared searchable <Select> (DESIGN.md §8, "every
// dropdown, no exceptions") rather than a plain native <select>.
export function BmrBatchPicker({ batches }: { batches: BmrBatchOption[] }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = batches.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-md">
        <label htmlFor="bmr-batch" className="mb-1 block text-xs font-medium text-muted">
          Finished Product batch
        </label>
        <Select id="bmr-batch" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select a batch…</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.batchNo} — {b.fpCode} · {b.fpName}
            </option>
          ))}
        </Select>
      </div>

      {selected && (
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
          <div>
            <p className="font-medium">
              {selected.batchNo} — {selected.fpCode} · {selected.fpName}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {selected.startDate} – {selected.endDate} · {selected.components.length}{" "}
              raw material{selected.components.length === 1 ? "" : "s"}
            </p>
          </div>
          <BmrDownloadLink
            fpCode={selected.fpCode}
            fpName={selected.fpName}
            batchNo={selected.batchNo}
            batchSize={selected.batchSize}
            unit={selected.unit}
            startDate={selected.startDate}
            endDate={selected.endDate}
            batchYield={selected.batchYield}
            yieldPct={selected.yieldPct}
            rmObtainedDate={selected.rmObtainedDate}
            components={selected.components}
          />
        </div>
      )}
    </div>
  );
}

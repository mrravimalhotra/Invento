"use client";

import { startFpRetestQualityCheck } from "@/lib/actions/qc";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { formatDate, formatQty, isLegacyCode } from "@/lib/utils";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";
import { RetestCard, RetestRow, suggestedSample } from "./retest-card";

export type FpDueForRetestLine = {
  batch_id: string;
  item_code: string | null;
  item_name: string | null;
  batch_label: string;
  unit: string;
  qc_sample_qty: string | number | null;
  stability_reserve_left: string | number | null;
  bulk_left: string | number | null;
  retest_date: string | null;
  expiry_date: string | null;
  is_legacy?: boolean;
};

// "Finished product due for retest" (SCAN-P4-04, 12 Oct 2026): the same retest cycle as raw
// material. The sample is drawn from the batch's stability sample first, then from its bulk
// (start_fp_retest(), migration 0120). Each row is its own form so one batch's error never
// affects the others. Respects the app-wide "Hide legacy data" preference like the other cards.
export function FpDueForRetest({ lines, canStart }: { lines: FpDueForRetestLine[]; canStart: boolean }) {
  const [hideLegacy] = useHideLegacy();
  const visible = hideLegacy
    ? lines.filter((l) => !isLegacyCode(l.item_code) && !isLegacyCode(l.batch_label))
    : lines;

  if (visible.length === 0) return null;

  return (
    <RetestCard
      title="Finished product due for retest"
      intro={
        <>
          Retest date has arrived on these approved finished product batches. Enter the retest sample: it comes from the
          batch&apos;s stability sample first, then from its bulk. Until the retest is approved the batch cannot be packed or labelled.
        </>
      }
    >
      {visible.map((line) => (
        <RetestRow
          key={line.batch_id}
          action={startFpRetestQualityCheck.bind(null, line.batch_id)}
          heading={
            <>
              {line.item_code ? `${line.item_code} — ${line.item_name ?? ""}` : (line.item_name ?? "—")} · {line.batch_label}
              <LegacyTag show={line.is_legacy} />
            </>
          }
          details={
            <>
              Stability sample left: {formatQty(Number(line.stability_reserve_left ?? 0))} {line.unit} · Bulk left:{" "}
              {formatQty(Number(line.bulk_left ?? 0))} {line.unit}
              {line.retest_date ? ` · Retest date ${formatDate(line.retest_date)}` : ""}
              {line.expiry_date ? ` · Expires ${formatDate(line.expiry_date)}` : ""}
            </>
          }
          batchLabel={line.batch_label}
          unit={line.unit}
          defaultSample={suggestedSample(line.qc_sample_qty)}
          canStart={canStart}
        />
      ))}
    </RetestCard>
  );
}

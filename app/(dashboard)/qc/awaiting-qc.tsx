"use client";

import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { formatNumber, isLegacyCode } from "@/lib/utils";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";

export type AwaitingQcLine = {
  id: string;
  batch_number: string;
  qc_qty: string | number | null;
  unit: string | null;
  items: { item_code: string; name: string } | null;
};

// Purely a fast path into /qc/new — the actual sample qty/unit/expiry are
// still entered (or adjusted) there, same as picking the batch by hand
// would require. This just removes the "search for it in a ~thousand-row
// dropdown" step for the batch that was probably *just* received.
//
// Respects the app-wide "Hide legacy data" preference the same way the
// legacy-aware <Select> comboboxes do (lib/hooks/use-hide-legacy.ts): read
// silently, filter client-side, no card-local checkbox of its own — the
// Dashboard toggle (or any other legacy-aware control) is the one place
// that preference is set. A batch counts as legacy if its item code or its
// own batch number does, same OR rule qc-table.tsx's isLegacyQcRow uses.
//
// The Card wrapper itself lives in this (client) component rather than in
// qc/page.tsx, and renders null once filtering leaves nothing to show —
// the server only knows the *unfiltered* count when deciding whether any
// batches are awaiting QC at all, so gating the card on that server count
// (as an earlier version of this component did) could leave an empty card
// on screen with "Hide legacy data" on and only legacy batches pending.
export function AwaitingQc({ lines, canStart }: { lines: AwaitingQcLine[]; canStart: boolean }) {
  const [hideLegacy] = useHideLegacy();
  const visible = hideLegacy
    ? lines.filter((l) => !isLegacyCode(l.items?.item_code) && !isLegacyCode(l.batch_number))
    : lines;

  if (visible.length === 0) return null;

  const shown = visible.slice(0, 8);
  const extra = visible.length - shown.length;

  return (
    <Card className="mb-4 border-brand/25">
      <CardHeader title="Awaiting QC" />
      <CardBody className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          These batches have been received but don&apos;t have a QC record yet — start one below.
        </p>
        <div className="flex flex-col gap-2">
          {shown.map((line) => (
            <div
              key={line.id}
              className="flex items-center justify-between gap-3 rounded-md border border-brand/25 bg-brand-light/40 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {line.items ? `${line.items.item_code} — ${line.items.name}` : "—"} · {line.batch_number}
                </p>
                {line.qc_qty !== null && (
                  <p className="text-xs text-muted">
                    QC qty: {formatNumber(line.qc_qty)} {line.unit}
                  </p>
                )}
              </div>
              {canStart && (
                <LinkButton href={`/qc/new?line=${line.id}`} variant="secondary" size="sm">
                  Start QC
                </LinkButton>
              )}
            </div>
          ))}
          {extra > 0 && (
            <Link href="/qc/new" className="text-xs text-brand-dark hover:underline">
              +{extra} more batch{extra === 1 ? "" : "es"} awaiting QC — open New AR
            </Link>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

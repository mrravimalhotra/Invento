import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

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
export function AwaitingQc({ lines, canStart }: { lines: AwaitingQcLine[]; canStart: boolean }) {
  const shown = lines.slice(0, 8);
  const extra = lines.length - shown.length;

  return (
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
  );
}

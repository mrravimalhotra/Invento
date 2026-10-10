"use client";

import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";
import { formatDate, formatQty, fpBatchBoth } from "@/lib/utils";
import type { FpInProgressRow } from "@/lib/fp-in-progress";

// B34 / FB-0049 / FB-0056: finished product batches that have started and are
// not yet complete, so QC can do in-process testing. Information only: QC
// opens the batch to see its composition; the batch leaves this list when it
// is completed and appears under "Finished Product Awaiting QC".
export function BatchesInProgress({ rows, total }: { rows: FpInProgressRow[]; total: number }) {
  const [hideLegacy] = useHideLegacy();
  const visible = hideLegacy ? rows.filter((r) => !r.is_legacy) : rows;
  if (visible.length === 0) return null;

  return (
    <Card className="mb-4 border-amber/40">
      <CardHeader title="Finished Product Batches In Progress" />
      <CardBody className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          These batches have started and are not complete yet. They move to &ldquo;Finished Product Awaiting QC&rdquo; when completed.
        </p>
        <div className="flex flex-col gap-2">
          {visible.map((r) => (
            <Link
              key={r.id}
              href={`/finished-product/${r.id}`}
              className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber-bg/50 px-3 py-2 text-sm hover:underline"
            >
              <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
              <span>
                <span className="font-medium">{r.mfr_definitions?.name ?? "—"}</span> · {fpBatchBoth(r.batch_number, r.short_batch_no)}
                <LegacyTag show={r.is_legacy} />
                <span className="block text-xs text-muted">
                  Started {formatDate(r.batch_start_date ?? r.created_at)} · {formatQty(r.target_qty)} {r.unit} planned
                </span>
              </span>
            </Link>
          ))}
        </div>
        {total > rows.length && <p className="text-xs text-muted">+ {total - rows.length} more older batches in progress</p>}
      </CardBody>
    </Card>
  );
}

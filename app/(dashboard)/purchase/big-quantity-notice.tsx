"use client";

import { useEffect, useState } from "react";
import { lastPurchaseForItem } from "@/lib/actions/purchase";
import { convertUnit } from "@/lib/constants/units";
import { formatQty } from "@/lib/utils";

// SCAN-P10-05: warn (never block) when a purchase quantity is 10 times or more
// the last purchase of the same item, in the same unit. A stray extra zero is
// the usual cause; a genuinely large order just ticks the box and saves.
const FACTOR = 10;

export type LastPurchase = { quantity: number; unit: string };

/** The latest earlier purchase of this item, or null (none yet, or still loading). */
export function useLastPurchase(itemId: string, excludeLineId?: string): LastPurchase | null {
  const [found, setFound] = useState<{ itemId: string; last: LastPurchase | null } | null>(null);
  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    lastPurchaseForItem(itemId, excludeLineId)
      .then((last) => {
        if (!cancelled) setFound({ itemId, last });
      })
      .catch(() => {
        if (!cancelled) setFound({ itemId, last: null });
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, excludeLineId]);
  return found && found.itemId === itemId ? found.last : null;
}

/** True when `quantity` (in `unit`) is at least 10 times the last purchase. */
export function isMuchLargerThanLast(quantity: number, unit: string, last: LastPurchase | null): boolean {
  if (!last || !(quantity > 0) || !unit || last.quantity <= 0) return false;
  const lastInUnit = convertUnit(last.quantity, last.unit, unit);
  if (lastInUnit === null || lastInUnit <= 0) return false;
  return quantity >= FACTOR * lastInUnit;
}

export function BigQuantityNotice({
  last,
  confirmed,
  onConfirmedChange,
}: {
  last: LastPurchase;
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
}) {
  return (
    <div role="alert" className="-mt-2 space-y-2 text-sm text-red">
      <p>
        This is 10 times or more the last purchase of this item (last: {formatQty(last.quantity)} {last.unit}). Please
        check for an extra zero.
      </p>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={confirmed}
          onChange={(e) => onConfirmedChange(e.target.checked)}
        />
        <span>Yes, this quantity is correct.</span>
      </label>
    </div>
  );
}

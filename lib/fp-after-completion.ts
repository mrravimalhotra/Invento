import { convertUnit } from "@/lib/constants/units";

// SCAN-P5-14: the figures on a finished product batch's "After completion" card.
// Same rule as the Ageing report and the packaging stock check (SCAN-P6-06):
// bulk left = yield - samples - what packaging issues took. Packaging issues
// record the bulk they used in the product item's unit, so it is converted to
// the batch's own unit (a batch in litres whose item is in ml, for example)
// before it is subtracted.
export function afterCompletion(input: {
  batchYield: number | null;
  batchUnit: string;
  itemUnit: string | null;
  qcSample: number | null;
  stability: number | null;
  rnd: number | null;
  issuedInItemUnit: number[];
}) {
  const factor = input.itemUnit ? (convertUnit(1, input.batchUnit, input.itemUnit) ?? 1) : 1;
  const samples = Number(input.qcSample ?? 0) + Number(input.stability ?? 0) + Number(input.rnd ?? 0);
  const packedItemUnit = input.issuedInItemUnit.reduce((a, b) => a + Number(b ?? 0), 0);
  const packed = packedItemUnit / factor;
  const left = input.batchYield == null ? null : Math.max(0, Number(input.batchYield) - samples - packed);
  return { samples, packed, left, factor };
}

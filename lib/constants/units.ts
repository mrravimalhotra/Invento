export const UNITS = ["kg", "g", "mg", "ltr", "ml", "count", "bottle", "pack"] as const;
export type Unit = (typeof UNITS)[number];

// FB-0017 (2 Sept 2026): items.default_sample_unit (0007_item_code_fp_and_
// sample_unit.sql) was deliberately shipped display-only — no conversion
// table existed anywhere in the schema, so a QC/stability/R&D quantity
// entered "in a smaller unit" just showed a warning telling the user to
// convert it by hand before saving. Ravi asked for the real thing: an
// actual smaller-unit picker on the Purchase line form, the value it holds
// converted into the line's own `unit` before qc_qty/stability_qty/rnd_qty
// are stored (they still share one `unit` column with `quantity` and feed
// the generated `remaining_qty` column — see lib/actions/purchase.ts).
//
// Only two of the eight UNITS values are actually convertible into one
// another: weight (mg/g/kg) and volume (ml/ltr). count/bottle/pack are
// discrete container units with no fixed ratio between them (a "pack" has
// no universal gram-equivalent), so each is its own one-member family —
// a sample unit can only be itself for those, never converted.
const UNIT_FAMILIES: Record<string, readonly Unit[]> = {
  weight: ["mg", "g", "kg"],
  volume: ["ml", "ltr"],
};

// Grams-per-unit for weight, ml-per-unit for volume; irrelevant (never used
// in a cross-unit conversion) for the single-member families.
const BASE_FACTOR: Record<Unit, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  ml: 1,
  ltr: 1000,
  count: 1,
  bottle: 1,
  pack: 1,
};

export function unitFamily(u: string): string | null {
  for (const [family, units] of Object.entries(UNIT_FAMILIES)) {
    if ((units as readonly string[]).includes(u)) return family;
  }
  return null;
}

/** Units the given unit can be converted to/from — always includes itself. */
export function compatibleUnits(u: string): readonly Unit[] {
  const family = unitFamily(u);
  if (family) return UNIT_FAMILIES[family];
  return UNITS.filter((x) => x === u);
}

/** Converts `value` from `from` to `to`. Returns null if the two units aren't in the same convertible family (never guessed at). */
export function convertUnit(value: number, from: string, to: string): number | null {
  if (from === to) return value;
  const f1 = unitFamily(from);
  const f2 = unitFamily(to);
  if (!f1 || !f2 || f1 !== f2) return null;
  return (value * BASE_FACTOR[from as Unit]) / BASE_FACTOR[to as Unit];
}

export const DEPARTMENTS = ["production", "rnd", "store"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const ITEM_CATEGORIES = ["raw", "processed", "packaging"] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

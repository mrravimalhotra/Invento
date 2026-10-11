// Largest values the app accepts. These mirror the database check constraints
// added in migration 0116 (public.qty_limit and the *_limit constraints), so a
// slip like an extra zero is caught with a clear message before the database
// has to refuse it. Keep both in step.

/** Largest quantity accepted for a unit (same figures as public.qty_limit). */
export function quantityLimit(unit: string | null | undefined): number {
  switch ((unit ?? "").trim().toLowerCase()) {
    case "kg":
    case "ltr":
      return 1_000_000;
    case "g":
    case "ml":
      return 1_000_000_000;
    case "mg":
      return 1_000_000_000_000;
    default:
      return 100_000_000;
  }
}

export const UNIT_PRICE_MAX = 10_000_000;
export const NAME_MAX = 200;
export const ADDRESS_MAX = 500;
export const TEXT_MAX = 2000;
export const STEP_MAX = 5000;
export const UNIT_COUNT_MAX = 100_000_000;

const fmt = (n: number) => n.toLocaleString("en-IN");

/** Error text when a quantity is above the largest accepted for its unit, else null. */
export function quantityLimitError(label: string, value: number | null | undefined, unit: string): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const max = quantityLimit(unit);
  if (value <= max) return null;
  return `${label} is above the largest value the app accepts (${fmt(max)} ${unit}). Check for an extra zero, or enter it in a larger unit.`;
}

/** Error text when a price is above the largest accepted, else null. */
export function unitPriceLimitError(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= UNIT_PRICE_MAX) return null;
  return `Unit price is above the largest value the app accepts (₹ ${fmt(UNIT_PRICE_MAX)}). Check for an extra zero.`;
}

/** Error text when text is longer than allowed, else null. */
export function textLimitError(label: string, value: string | null | undefined, max: number): string | null {
  if (value == null || value.length <= max) return null;
  return `${label} is too long (${fmt(value.length)} characters; the limit is ${fmt(max)}). Please shorten it.`;
}

/** First non-null message, for chaining several checks. */
export function firstLimitError(...checks: Array<string | null>): string | null {
  return checks.find((c) => c) ?? null;
}

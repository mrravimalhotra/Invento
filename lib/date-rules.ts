import { formatDate, todayIst, toIstDateString } from "@/lib/utils";

// Ravi (3 Oct 2026): date entry rules by function (FB-0055 widened, "Date
// validation review"). App-level checks only: the form limits the date box and
// the server action repeats the same rule on save. All comparisons are on
// "YYYY-MM-DD" strings in India time, so a plain string comparison is correct.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a well-formed YYYY-MM-DD string. */
export function isIsoDate(value: string | null | undefined): value is string {
  return !!value && ISO.test(value);
}

/** The India calendar day of a timestamp (e.g. an approval time), or null. */
export function istDay(timestamp: string | null | undefined): string | null {
  return timestamp ? toIstDateString(new Date(timestamp)) : null;
}

/** "<Label> cannot be in the future." when the date is after today (India); empty/invalid values are left to other checks. */
export function futureDateError(value: string | null | undefined, label: string): string | null {
  if (!isIsoDate(value)) return null;
  return value > todayIst() ? `${label} cannot be in the future.` : null;
}

/** "<Label> cannot be before <otherLabel> (dd-mm-yyyy)." when value < other. */
export function beforeDateError(
  value: string | null | undefined,
  other: string | null | undefined,
  label: string,
  otherLabel: string
): string | null {
  if (!isIsoDate(value) || !isIsoDate(other)) return null;
  return value < other ? `${label} cannot be before ${otherLabel} (${formatDate(other)}).` : null;
}

/** "<Label> must be after <otherLabel> (dd-mm-yyyy)." when value <= other. */
export function notAfterDateError(
  value: string | null | undefined,
  other: string | null | undefined,
  label: string,
  otherLabel: string
): string | null {
  if (!isIsoDate(value) || !isIsoDate(other)) return null;
  return value <= other ? `${label} must be after ${otherLabel} (${formatDate(other)}).` : null;
}

/** First non-null message, for chaining several rules. */
export function firstDateError(...errors: (string | null)[]): string | null {
  return errors.find((e) => !!e) ?? null;
}

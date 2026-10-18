// P8-01 (Ravi, 18 Oct 2026): an instrument's calibration status is worked out
// from its Next due date; the only choice a person makes is whether it needs
// calibration at all. Shared by the Equipment list, its Excel file, the record
// page and the Dashboard card so they always agree.

export const CALIBRATION_DUE_SOON_DAYS = 30;

export const CALIBRATION_CHOICES = [
  { value: "required", label: "Needs calibration" },
  { value: "not_applicable", label: "Not applicable" },
] as const;

export type CalibrationTone = "ok" | "soon" | "overdue" | "none";

export type CalibrationState = {
  label: string;
  tone: CalibrationTone;
  /** Days until Next due (negative when overdue); null when there is no date to count from. */
  days: number | null;
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function calibrationState(
  status: string | null | undefined,
  nextDue: string | null | undefined,
  today: string
): CalibrationState {
  if (status === "not_applicable") return { label: "Not applicable", tone: "none", days: null };
  if (!nextDue) return { label: "No due date", tone: "soon", days: null };
  const days = daysBetween(today, nextDue);
  if (days < 0) return { label: `Overdue by ${-days} ${-days === 1 ? "day" : "days"}`, tone: "overdue", days };
  if (days === 0) return { label: "Due today", tone: "soon", days };
  if (days <= CALIBRATION_DUE_SOON_DAYS) return { label: `Due in ${days} ${days === 1 ? "day" : "days"}`, tone: "soon", days };
  return { label: "Calibrated", tone: "ok", days };
}

/** True when the instrument belongs on the Dashboard card: overdue, or due within 30 days. */
export function calibrationNeedsAttention(s: CalibrationState): boolean {
  return s.tone === "overdue" || (s.tone === "soon" && s.days !== null);
}

/** The error to show when a record says "Needs calibration" but has no Next due date. */
export function calibrationDueDateError(status: string | null | undefined, nextDue: string | null | undefined): string | null {
  return status === "required" && !nextDue ? "Next calibration due is required when the equipment needs calibration." : null;
}

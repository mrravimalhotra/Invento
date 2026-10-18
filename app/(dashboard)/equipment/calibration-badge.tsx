import { Badge } from "@/components/ui/badge";
import type { CalibrationState, CalibrationTone } from "@/lib/calibration";

// Green when calibrated, amber when due within 30 days (or no date), red when overdue (P8-01).
const TONE_STYLE: Record<CalibrationTone, string> = {
  ok: "approved",
  soon: "pending",
  overdue: "rejected",
  none: "not_submitted",
};

export function CalibrationBadge({ state }: { state: CalibrationState }) {
  return <Badge status={TONE_STYLE[state.tone]}>{state.label}</Badge>;
}

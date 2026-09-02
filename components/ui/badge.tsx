import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-brand-light text-brand-dark",
  clear: "bg-brand-light text-brand-dark",
  submitted: "bg-amber-bg text-amber",
  submitted_to_qc: "bg-amber-bg text-amber",
  pending: "bg-amber-bg text-amber",
  not_submitted: "bg-black/5 text-muted",
  in_process: "bg-black/5 text-muted",
  rejected: "bg-red-bg text-red",
  not_clear: "bg-red-bg text-red",
  push: "bg-brand-light text-brand-dark",
  pull: "bg-amber-bg text-amber",
  wastage: "bg-red-bg text-red",
  // Batch QC status (lib/batch-qc-status.ts), used on the RM Report's QC
  // Status column — "qc_pending"/"approved"/"rejected" reuse the styles
  // above (same meaning); "awaiting_retest" gets the same amber as
  // submitted/pending, matching this app's convention of amber for a
  // genuine attention/overdue signal (e.g. the QC list's "Due for retest"
  // card) rather than a routine next step.
  qc_pending: "bg-black/5 text-muted",
  awaiting_retest: "bg-amber-bg text-amber",
};

export function Badge({ status, children }: { status?: string; children: React.ReactNode }) {
  const style = (status && STATUS_STYLES[status]) || "bg-black/5 text-muted";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", style)}>
      {children}
    </span>
  );
}

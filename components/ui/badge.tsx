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
};

export function Badge({ status, children }: { status?: string; children: React.ReactNode }) {
  const style = (status && STATUS_STYLES[status]) || "bg-black/5 text-muted";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", style)}>
      {children}
    </span>
  );
}

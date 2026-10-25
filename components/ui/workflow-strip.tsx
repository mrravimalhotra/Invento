import { Check, Circle, CircleDot, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepState, Workflow } from "@/lib/workflow-steps";

// UX-06: read-only steps under a page title (lib/workflow-steps.ts decides them).
const STYLE: Record<StepState, string> = {
  done: "border-brand/20 bg-brand-light text-brand-dark",
  current: "border-brand bg-brand font-semibold text-white",
  todo: "border-border bg-white text-muted",
  stopped: "border-red/40 bg-red-bg font-semibold text-red",
};
const ICON = { done: Check, current: CircleDot, todo: Circle, stopped: X } as const;
const SPOKEN: Record<StepState, string> = { done: "done", current: "current step", todo: "to come", stopped: "stopped" };

export function WorkflowStrip({ workflow, className }: { workflow: Workflow; className?: string }) {
  return (
    <div className={cn("mb-6", className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs" aria-label="Workflow steps">
        {workflow.steps.map((s, i) => {
          const Icon = ICON[s.state];
          return (
            <li key={s.label} className="flex items-center gap-1.5">
              {i > 0 && <span className="h-px w-4 bg-border" aria-hidden="true" />}
              <span
                className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1", STYLE[s.state])}
                aria-current={s.state === "current" ? "step" : undefined}
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                {s.label}
                <span className="sr-only"> ({SPOKEN[s.state]})</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm text-muted">
        <span className="font-semibold text-foreground">Next:</span> {workflow.next}
      </p>
    </div>
  );
}

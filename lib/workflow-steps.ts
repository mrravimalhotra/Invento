// UX-06 (25 Oct 2026, Ravi approved the mockup): where a record is in its workflow,
// shown as a read-only strip under the page title, with one line on what comes next.

export type StepState = "done" | "current" | "todo" | "stopped";
export type WorkflowStep = { label: string; state: StepState };
export type Workflow = { steps: WorkflowStep[]; next: string };

function chain(labels: string[], current: number, allDone = false): WorkflowStep[] {
  return labels.map((label, i) => ({
    label,
    state: allDone || i < current ? "done" : i === current ? "current" : "todo",
  }));
}

const FP_STEPS = ["Draft", "In Process", "Complete", "Submitted to QC", "Approved", "Packed"];

/** A finished product batch: its own status, its latest QC record's status, and whether any packaging issue exists. */
export function fpWorkflow(status: string, qcStatus: string | null | undefined, packed: boolean): Workflow {
  if (status === "cancelled") {
    return {
      steps: [{ label: "Draft", state: "done" }, { label: "Cancelled", state: "stopped" }],
      next: "nothing — this draft was cancelled and its raw material went back to inventory.",
    };
  }
  if (status === "rejected" || qcStatus === "rejected") {
    return {
      steps: [...chain(FP_STEPS.slice(0, 4), 4), { label: "Rejected", state: "stopped" }],
      next: "nothing — a rejected batch cannot be packed.",
    };
  }
  if (status === "approved" || qcStatus === "approved") {
    return packed
      ? { steps: chain(FP_STEPS, 6, true), next: "more packing from Packaging while quantity is left." }
      : { steps: chain(FP_STEPS, 4), next: "pack or issue it from Packaging." };
  }
  switch (status) {
    case "draft":
      return { steps: chain(FP_STEPS, 0), next: "Create batch on this page to start production (or Cancel)." };
    case "in_process":
      return { steps: chain(FP_STEPS, 1), next: "Complete batch with the yield and samples, on this page." };
    case "complete_awaiting_qc":
      return { steps: chain(FP_STEPS, 2), next: "Submit to QC on this page." };
    default: {
      const round1Done = qcStatus === "checker_approved" || qcStatus === "checker_rejected";
      return {
        steps: chain(FP_STEPS, 3),
        next: round1Done
          ? "the final decision by a QC Reviewer (Round 1 is done)."
          : "QC Round 1 by a Quality Checker, then the final decision by a QC Reviewer.",
      };
    }
  }
}

/** A purchase order: its status, and how many of its raw material lines have a QC decision. */
export function poWorkflow(status: string, rawLines: number, decided: number): Workflow {
  if (status === "draft") {
    return { steps: chain(["Draft", "Submitted", "QC decided"], 0), next: "add the lines, then Submit order." };
  }
  if (rawLines === 0) {
    return { steps: chain(["Draft", "Submitted"], 2, true), next: "nothing — packaging lines need no QC." };
  }
  if (decided >= rawLines) {
    return {
      steps: chain(["Draft", "Submitted", "QC decided"], 3, true),
      next: `nothing — every raw material batch has a QC decision (${decided} of ${rawLines}).`,
    };
  }
  return {
    steps: chain(["Draft", "Submitted", "QC decided"], 1),
    next: `QC decisions on its raw material batches (${decided} of ${rawLines} decided).`,
  };
}

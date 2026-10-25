// UX-04 (25 Oct 2026, Ravi approved the mockup): the Dashboard's "My tasks" card. Each
// task belongs to the roles that do that step (the same roles MODULE_WRITE_ROLES gives
// the step); System Admin sees every task. Counts only: a line opens its screen.
import type { Role } from "@/lib/constants/roles";

export type TaskKey = "qc_round1" | "qc_round2" | "fp_draft" | "fp_in_process" | "fp_complete" | "fp_unpacked" | "po_draft";

type TaskDef = { key: TaskKey; roles: Role[]; href: string; link: string; label: (n: number) => string };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const TASKS: TaskDef[] = [
  { key: "qc_round1", roles: ["quality_checker"], href: "/qc", link: "Open QC list",
    label: (n) => plural(n, "QC record waiting for Round 1", "QC records waiting for Round 1") },
  { key: "qc_round2", roles: ["qc_reviewer"], href: "/qc", link: "Open QC list",
    label: (n) => plural(n, "Round 1 done, waiting for your final decision", "Round 1 done, waiting for your final decision") },
  { key: "fp_in_process", roles: ["mfr_manager", "inventory_manager"], href: "/finished-product", link: "Open Finished Product",
    label: (n) => plural(n, "Batch in process to complete", "Batches in process to complete") },
  { key: "fp_complete", roles: ["mfr_manager", "inventory_manager"], href: "/finished-product", link: "Open Finished Product",
    label: (n) => plural(n, "Batch complete, to submit to QC", "Batches complete, to submit to QC") },
  { key: "fp_draft", roles: ["mfr_manager", "inventory_manager"], href: "/finished-product", link: "Open Finished Product",
    label: (n) => plural(n, "Draft to create or cancel", "Drafts to create or cancel") },
  { key: "fp_unpacked", roles: ["mfr_manager", "inventory_manager"], href: "/packaging", link: "Open Packaging",
    label: (n) => plural(n, "Approved batch not yet packed", "Approved batches not yet packed") },
  { key: "po_draft", roles: ["inventory_manager"], href: "/purchase", link: "Open Purchase",
    label: (n) => plural(n, "Draft purchase order to submit", "Draft purchase orders to submit") },
];

/** The tasks a user with these roles sees, in card order. */
export function tasksFor(roles: readonly Role[]): TaskDef[] {
  if (roles.includes("system_admin")) return TASKS;
  return TASKS.filter((t) => t.roles.some((r) => roles.includes(r)));
}

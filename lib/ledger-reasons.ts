// ACC-32 (29 Sept 2026): the ledger's Reason filter and labels were written
// before packaging, packaged finished product, FP draft cancellation and
// production raw material existed, so those rows showed a raw code
// ("fp_packaging_pull") and could not be filtered. One list now drives the
// Reason filter, the Reference column and the accepted filter values.
//
// Every value here is allowed by inventory_ledger's reference_type check
// constraint (0050). `qc` is only on historical rows (nothing writes it any
// more): it has a label but is not offered in the filter.

export const LEDGER_REASONS: { value: string; label: string; inFilter: boolean }[] = [
  { value: "purchase", label: "Purchase", inFilter: true },
  { value: "qc", label: "QC", inFilter: false },
  { value: "qc_sample", label: "QC Sample", inFilter: true },
  { value: "stability_sample", label: "Stability Sample", inFilter: true },
  { value: "rnd_sample", label: "R&D Sample", inFilter: true },
  { value: "finished_product", label: "Finished Product", inFilter: true },
  { value: "fp_yield", label: "FP Batch Yield", inFilter: true },
  { value: "fp_draft_cancelled", label: "FP Draft Cancelled (RM returned)", inFilter: true },
  { value: "packaging", label: "Packaging", inFilter: true },
  { value: "fp_packaging_pull", label: "FP Used for Packaging", inFilter: true },
  { value: "packaged_fp_yield", label: "Packaged FP Yield", inFilter: true },
  { value: "packaged_fp_issue", label: "Packaged FP Issued", inFilter: true },
  { value: "production_rm_yield", label: "Production RM Yield", inFilter: true },
  { value: "qc_rejected", label: "QC Rejected (moved to Rejected Materials)", inFilter: true },
];

export const LEDGER_REASON_LABELS: Record<string, string> = Object.fromEntries(
  LEDGER_REASONS.map((r) => [r.value, r.label])
);

export const LEDGER_REASON_VALUES = new Set(LEDGER_REASONS.map((r) => r.value));

export const LEDGER_FILTER_OPTIONS = LEDGER_REASONS.filter((r) => r.inFilter).map(({ value, label }) => ({ value, label }));

// A code without a label (a future reference type) is shown readable, not raw.
export function ledgerReasonLabel(referenceType: string): string {
  return LEDGER_REASON_LABELS[referenceType] ?? referenceType.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

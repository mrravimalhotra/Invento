## REQ-12 — QC status names from `lib/status-labels.ts`, the same on every screen, report and the User Guide

> "Status names: Awaiting QC → Round 1 approved — awaiting review (or Round 1 rejection proposed) → Approved / Rejected, from `lib/status-labels.ts`, the same on every screen, report and the User Guide."
> — docs/modules/qc.md · bullet 1

**Verdict:** partial · confidence: high

**What this demands of an implementation:** every place that shows a `quality_checks.status` value to a person (screen, PDF/Excel export, report, dashboard) shows it through `statusLabel()` / `qcRecordStatusLabel()`, giving exactly: `submitted` → "Awaiting QC", `checker_approved` → "Round 1 approved — awaiting review", `checker_rejected` → "Round 1 rejection proposed", `approved` → "Approved", `rejected` → "Rejected"; and the User Guide (docs/user-guide/USER_GUIDE.md, rendered from `app/(dashboard)/user-guide/guide-html.ts`) uses the same five names. Display only; the database is not involved.

**Where enforcement lives:**

```ts
// lib/status-labels.ts:L5-L11, L24-L31
submitted: "Awaiting QC",
checker_approved: "Round 1 approved — awaiting review",
checker_rejected: "Round 1 rejection proposed",
approved: "Approved",
rejected: "Rejected",
export function statusLabel(code) { ... STATUS_LABELS[code] ?? <code with spaces, first letter capital> }
```
- `lib/batch-qc-status.ts:L50-L52` `qcRecordStatusLabel()` delegates to `statusLabel()`.
- `tests/unit/status-labels.test.ts:L6-L14` pins the five strings. No test checks that callers use it.

**Paths walked (places a QC record status reaches a person):**
- QC list screen and its export: `app/(dashboard)/qc/qc-table.tsx:L71` (badge) and `L125` (export) → `qcRecordStatusLabel`. ✓
- QC record page header badge: `qc/[id]/page.tsx:L176` → `qcRecordStatusLabel`. ✓
- QC record page, Round 1 card: `qc/[id]/page.tsx:L225-L227` hard-codes "Round 1 rejection proposed" / "Rejected" / "Approved". Same words as the library for the proposed case, but not from it. ~ (decision of Round 1, not the record status; acceptable wording, not sourced from the library)
- QC record page, Round 2 card: `qc/[id]/page.tsx:L324` renders the raw code `{record.status}`; the badge's CSS `capitalize` (`components/ui/badge.tsx`) makes it read "Approved"/"Rejected". Same text by accident, not from the library. ~
- Reports, QC Register screen and PDF: `reports/report-tables.tsx:L121` → `qcRecordStatusLabel` for both cell and `pdfValue`. ✓
- Samples tab and its export: `inventory/(tabs)/samples/samples-table.tsx:L35, L43, L76` → `statusLabel`. ✓
- Labels picker: `labels/label-picker.tsx:L286, L293` → `statusLabel`. ✓
- Item page FP batches: `inventory/items/[id]/fp-batches-table.tsx:L45` → `statusLabel`. ✓
- Batch Trace screen: `inventory/(tabs)/batch-trace/trace-view.tsx:L174, L244` → `statusLabel`. ✓
- **Batch Trace Excel/PDF export: `trace-view.tsx:L214` `{ header: "Status", value: (r) => r.status }`** — raw code. `trace_batch()` (latest definition `0106_batch_trace.sql:L219`) returns `q.status` for QC nodes, so the export prints `submitted`, `checker_approved`, `checker_rejected`. ✗
- **Finished Product batch page, "QC record" card: `finished-product/[id]/page.tsx:L424` `<Badge status={latestQc.status}>{latestQc.status}</Badge>`** — raw code; with CSS capitalize it reads "Submitted", "Checker_approved", "Checker_rejected". ✗
- **Dashboard "QC by status" pie: `app/(dashboard)/charts.tsx:L51-L52`** — slice names hard-coded: "Submitted" (should be "Awaiting QC") and "Round 1 approved — awaiting review". ✗ In addition `app/(dashboard)/page.tsx:L174-L176` folds `checker_rejected` into the `checker_approved` count, so proposed rejections are counted under a slice labelled "Round 1 approved — awaiting review". ✗
- Dashboard stat card "Pending QC" (`dashboard-view.tsx:L237`, = submitted + Round 1 states, L109): an aggregate name, not one of the five statuses. ~ (not a contradiction, but a sixth name for "not decided yet"; "Pending QC" is also the opening-stock status word, lib/opening-stock/*)
- Event history uses its own labels (`lib/qc-results.ts:L90-L99`, e.g. "Round 1: rejection proposed", "Round 2: rejected"). These name decisions, not statuses. ~
- Packaging/FP-batch statuses (`fpStatusLabel`, `lib/finished-product-status.ts:L59-L72`) keep a second table that duplicates `status-labels.ts` for FP codes; wording agrees today. Outside the QC five, noted only.

User Guide (docs/user-guide/USER_GUIDE.md):
- L459 "its status becomes Awaiting QC", L465 "**Round 1 approved — awaiting review**", L466 "**"Round 1 rejection proposed"**", L469/L471 "returns the AR to Awaiting QC", L486 "shows Approved". ✓
- **L462: "Open the AR. With the batch still "Submitted," you'll see the Round 1 form."** — the old name for `submitted`. ✗ The same sentence is in the rendered guide (`app/(dashboard)/user-guide/guide-html.ts`, "batch still “Submitted,”").

**Searched:**
- `status-labels` imports in app/lib/components → 6 files: labels/label-picker.tsx, inventory/items/[id]/fp-batches-table.tsx, inventory/(tabs)/samples/samples-table.tsx, inventory/(tabs)/batch-trace/trace-view.tsx, finished-product/[id]/page.tsx, lib/batch-qc-status.ts.
- `qcRecordStatusLabel` → qc/[id]/page.tsx, qc/qc-table.tsx, reports/report-tables.tsx, lib/batch-qc-status.ts.
- `<Badge` across app/components → 48 hits; raw QC status as children at qc/[id]/page.tsx:L324 and finished-product/[id]/page.tsx:L424; all others use a label function or fixed non-QC text.
- `checker_approved|checker_rejected` outside `.eq/.in/===` → dashboard-view.tsx, charts.tsx, page.tsx (dashboard), qc-checker-form.tsx (choice labels "Approved"/"Rejected"), badge.tsx, label-eligibility.ts (comment), lib/actions/qc.ts (comments), lib/status-labels.ts.
- `"Submitted"` in app/lib → charts.tsx:L51 (QC pie) and purchase-table.tsx / purchase-order-view.tsx / workflow-steps.ts (purchase-order status, not QC).
- `header: "Status"|"QC status"` in exports → QC-related raw value only at trace-view.tsx:L214.
- `replace(/_/g` → status-labels.ts, finished-product-status.ts, ledger-reasons.ts, audit-diff.ts, stock-integrity page; none for QC status.
- PDF/DOCX generators (lib/coa-pdf.ts, labels/generate-label-pdf.ts, rm-intimation-pdf.ts, fp-intimation-pdf.ts, bmr-docx.ts) → `status` 0 hits; they print no QC status.
- USER_GUIDE.md `awaiting qc|awaiting review|rejection proposed|submitted|pending review|round 1 approved` → hits listed above; only L462 uses an old status name ("Submitted"). L809-L821 "Awaiting review" is Tester Feedback, not QC.

**How the verdict was reached:** the label table holds exactly the names the document lists and most screens and the QC exports/reports use it, so this is not `contradicted`. It is not `implemented` because the bullet's claim is universal ("every screen, report and the User Guide") and four places break it: the Batch Trace export (raw codes), the Finished Product batch page QC card (raw codes), the dashboard pie ("Submitted", and proposed rejections counted as "Round 1 approved — awaiting review"), and User Guide L462 ("Submitted"). None changes what the system does; severity Low. The dashboard miscount is the one with a reader consequence: a QC lead reading the pie sees proposed rejections as approvals awaiting review.

**Document problem:** none in the qc.md bullet itself; the User Guide (which the bullet names as conforming) is the document that diverges at L462.

**Open questions:**
- Whether "Pending QC" on the dashboard card is an accepted aggregate name or should become "Awaiting QC" / "Awaiting decision" — a wording decision for Ravi.
- Whether `checker_rejected` should get its own dashboard pie slice (the `QcStatusCounts` type at dashboard-view.tsx:L31 has no key for it).

# Module 15 — Reports

Route: `/reports`. Cross-reference: `docs/DESIGN.md` §4.14 (Dashboard &
Reports) and §9 (Known simplifications).

## Purpose

The old baseline's Reports screen was a placeholder that said "Coming soon"
— permanently, per the requirements review. This module replaces it with
four real, filterable registers, each exportable as a printed PDF table.

Reports is read-only: there is no `lib/actions/reports.ts` — every query
runs directly in the Server Component page (`app/(dashboard)/reports/page.tsx`),
consistent with the cross-cutting rule that `select` is open to any
signed-in user (`docs/DESIGN.md` §3) and there being no write to protect.

## Screens

### `/reports` — one page, four report cards

Each report is a `<ReportSection>` (`app/(dashboard)/reports/report-section.tsx`,
a small reusable Client Component) with:

- A `DataTable` (existing kit component — sort/search/paginate for free).
- An optional date-range filter (`From` / `To` date inputs) — filtered
  client-side against the already-fetched rows, per the instruction that
  server-side date-range query params/URL state weren't required for this
  pass.
- A Download PDF button (`lib/pdf.ts`'s `downloadPdfTable()`), exporting
  exactly the rows currently passing the date filter, so the download and
  on-screen table always match.

#### 1. RM Stock Report

Raw-material items (`items` where `category = 'raw'` and `active = true`)
joined client-side to `stock_balance` (the ledger-derived on-hand view) by
`item_id`.

| Column | Source |
|---|---|
| Item Code | `items.item_code` |
| Name | `items.name` |
| Unit | `items.unit` |
| On Hand | `stock_balance.on_hand` (0 if the item has no ledger rows yet) |
| Low Stock Threshold | `items.low_stock_threshold` |
| Flag | computed: "Below threshold" (amber) when `on_hand < low_stock_threshold`, else "OK" |

Date filter is on `items.created_at` ("Item added") — there's no other
natural single event-date on this report since it's a live snapshot, not a
transaction log.

#### 2. QC Register

All `quality_checks` rows (RM and finished-product QC alike — the table is
shared, gated by the `qc_one_subject` check constraint so exactly one of
`purchase_line_id` / `finished_product_batch_id` is set per row).

| Column | Source |
|---|---|
| AR Number | `quality_checks.ar_number` |
| Item | `items.name` via `item_id` |
| Batch | `purchase_lines.batch_number` via `purchase_line_id`, falling back to `finished_product_batches.batch_number` via `finished_product_batch_id` |
| Status | `quality_checks.status` (Badge — submitted/approved/rejected) |
| Reviewed At | `quality_checks.reviewed_at` |
| Retest Date | `quality_checks.retest_date` (generated column) |

Date filter is on `reviewed_at`. Not filtered by `active` — a QC register is
explicitly a historical log, so every row shows (the `.eq("active", true)`
default in `docs/AGENT_BRIEFING.md` names this as the intended exception).

#### 3. FP Register

All `finished_product_batches` rows, joined to `mfr_definitions` for the
formula name.

| Column | Source |
|---|---|
| Batch Number | `finished_product_batches.batch_number` |
| MFR | `mfr_definitions.name` via `mfr_definition_id` |
| Status | `finished_product_batches.status` (Badge) |
| Target Qty | `finished_product_batches.target_qty` |
| Actual Yield % | `finished_product_batches.actual_yield_pct` (generated column) |
| Finish Date | `finished_product_batches.finish_date` |

Date filter is on `finish_date`. Also not filtered by `active` (register,
same rationale as QC).

#### 4. Purchase Register

All `purchase_lines`, joined to `items` and to `purchase_orders` → `vendors`.

| Column | Source |
|---|---|
| PO Number | `purchase_orders.po_number` |
| Vendor | `vendors.name` via `purchase_orders.vendor_id` |
| Item | `items.name` via `purchase_lines.item_id` |
| Batch | `purchase_lines.batch_number` |
| Quantity | `purchase_lines.quantity` |
| Remaining Qty | `purchase_lines.remaining_qty` (generated column — sampling already deducted) |
| Expiry Date | `purchase_lines.expiry_date` |

Date filter is on `purchase_lines.created_at` ("Received") — the natural
"when was this batch received" event, distinct from `expiry_date` which is
already its own displayed column.

## Export format

The Download PDF button produces a real PDF (via `jsPDF` +
`jspdf-autotable`, through the shared `downloadPdfTable()` helper — same
letterhead as every other module's print output) containing a formatted
table of the currently-filtered rows. This is not a native `.xlsx`
spreadsheet binary. `docs/DESIGN.md` §9 already flags "Reports export as
CSV, not native `.xlsx`" as a known simplification for this pass (avoiding a
heavy Excel-writing dependency for v1); the concrete mechanism used here is
a jsPDF/autotable printed table rather than a raw `.csv` file, but it is the
same underlying gap already called out there: no native Excel export yet.
Noting the exact mechanism here so this doesn't read as a new, undocumented
gap during review.

## Files

- `app/(dashboard)/reports/page.tsx` — fetches all four datasets (Server
  Component)
- `app/(dashboard)/reports/report-section.tsx` — reusable report card:
  DataTable + date-range filter + Download PDF (Client Component)

## Expiry → Re-Test Date rename (2 Sept 2026)

Purchase Register's "Expiry Date" column (`purchase_lines.expiry_date`)
is now "Re-Test Date", matching the Purchase-screen rename
(`docs/modules/purchase.md`). The QC Register's "Retest Date" column
(`quality_checks.retest_date`) was already correctly labeled and is
unrelated — see `docs/modules/qc.md`, "Retest workflow," for the full
disambiguation between these two fields.

## Bug fix: RM Stock report row-cap truncation (1 Sept 2026)

Same root cause as `docs/modules/purchase.md`'s "Bug fix" section: the RM
Stock report's `items` query had no row limit and was ordered by
`item_code` ascending, so a server-side default row cap could silently
drop newly created raw materials from the report entirely once the legacy
row count filled the cap. Now ordered by `created_at descending` (newest
first), matching the FB-0006 precedent used elsewhere. **Display-order
change, flagged for review:** this report's rows were previously shown
sorted by item code; they now display newest-created first, since the
`RmStockReport` table renders rows in the order the query returns them
with no client-side re-sort. Functionally correct (all raw materials are
now included) but the row order on screen has changed.

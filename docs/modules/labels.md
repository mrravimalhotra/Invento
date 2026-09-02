# Module 12 — Label Printing

Promoted module from the second-pass requirements review (invisible in the
handwritten list and in `Invento-Modular-Requirements.docx` v1 — only
surfaced once the real physical templates were reviewed). Cross-reference:
`docs/DESIGN.md` §4.11.

## Screens
- `/labels` — single page, no route params. Two-step picker:
  1. **Label type** — Approved Raw Material / Under Test / In-process /
     Finished Product.
  2. **Record** — for the three RM label types, a `purchase_line` (batch
     number + item name); for Finished Product, a `finished_product_batch`.
  A live on-screen preview renders the selected template's exact fields;
  "Download PDF" builds the same fields into a compact ~4in×3in PDF via a
  custom jsPDF layout (`generate-label-pdf.ts`), reusing the brand color and
  company details from `lib/pdf.ts` (`COMPANY_NAME`, `COMPANY_ADDRESS`,
  `MFG_LIC_NO`) rather than the full-page `letterhead()`.

## Data
No new table — reads `purchase_lines` (+ `purchase_orders`/`vendors` for
Purchased From / Invoice-Ch. No. / Date of Receipt), `purchase_batch_status`
+ `quality_checks.retest_period_days` (for QC status/AR number/retest
period), and `finished_product_batches` (+ `mfr_definitions` for product
name). Read-only for every signed-in user — see below for why the write
gate is different from every other module here.

## Fields per template
- **Approved Raw Material**: company masthead, "APPROVED RAW MATERIAL",
  Name, Status (fixed "Approved" — this label is only ever printed once a
  batch is approved, independent of the picker's live QC badge), Batch No.,
  Batch Quantity, Purchased From, Invoice/Ch. No., Date of Receipt, Retest
  Period (from `quality_checks.retest_period_days`, else a blank line for
  hand entry), Sign (blank line).
- **Under Test**: "UNDER TEST", Name of RM/FP, Batch No., Batch Quantity,
  Purchased From, Invoice/Ch. No., Date of Receipt, Sign.
- **In-process**: "INPROCESS", Name, Status (fixed "IN-PROCESS"), Batch No.,
  Batch Quantity, Start Date, Sign.
- **Finished Product (Green)**: "Finished Product", Name, Status (fixed
  "Approved"), Batch No., Batch Quantity, Month of Manufacture (from
  `finish_date`), Best Before (from `expiry_month`), Sign.

## Role / access
No `MODULE_WRITE_ROLES` entry, per spec — this module has no write action of
its own (labels are generated client-side from data other modules already
wrote). Gated only behind sign-in, same as every other dashboard route via
`(dashboard)/layout.tsx`.

## Deviations / simplifications (flag for review)
- The record picker is **not** filtered by QC status per label type (e.g.
  the Approved Raw Material picker still lists every active purchase line,
  not only QC-approved ones) — the live QC-status badge next to the picker
  is the "optional cross-reference" the module brief asked for, so the user
  can check before printing, but nothing stops printing an Approved label
  for a batch that isn't actually approved yet. Matches the read-only,
  no-new-table nature of this module (§4.11): there's no gate to enforce
  without adding logic beyond "render existing fields."
- **In-process → Start Date** has no source column anywhere in the schema
  (`purchase_lines` has no "process start" date). Rather than invent a new
  field or repurpose an unrelated date, it prints as a blank line for hand
  entry, same treatment as Retest Period when absent and Sign on every
  template.
- **Date of Receipt** (Approved RM / Under Test) uses
  `purchase_orders.invoice_date` — there's no separate "receipt date" column
  in `purchase_lines`/`purchase_orders`; invoice date is the closest
  existing field.
- **Finished Product Batch Quantity** uses `net_qty`, falling back to
  `total_units` when `net_qty` is null.
- No Server Action / `lib/actions/labels.ts` — this module only reads
  existing tables and calls jsPDF client-side; there's no write to gate.

## Searchable, legacy-aware pickers (1 Sept 2026)

`label-picker.tsx`'s Purchase batch and Finished product batch selects are
searchable comboboxes app-wide now (DESIGN.md §8), both marked
`data-legacy` from `batchNumber` (already present on both record types —
no query changes).

## RM picker restricted to raw material (2 Sept 2026)

Found while scoping the Purchase module's currency/Re-Test-Date changes
(`docs/modules/purchase.md`), not separately requested: the Purchase
batch picker's underlying query (`page.tsx`) had no category filter, so
once Packaging Item purchase lines existed (Purchase screen's Raw
Material / Packaging Item toggle), every one of them would show up in the
"Approved Raw Material" / "RM Under Test" / "In-process" picker here —
all three are raw-material-specific label templates
(`requirements-gap-analysis.md`), and nothing about packaging stock
should be printable as an "Approved Raw Material" label. Fixed by
switching the `items` embed to `items!inner(name, category)` with
`.eq("items.category", "raw")` added — the same fix already applied to
QC's "New Assign Record" picker for the same reason.

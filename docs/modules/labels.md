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

## Approved Raw Material — pixel-perfect reference match (19 Sept 2026, revised same day)

Ravi supplied the physical template actually used on the shop floor
(`Approved RAW MATERIAL LABELS.doc`) and asked for the output to be "exact
pixel perfect copy of attached template": same size, format and font.
**Scoped to this one label type only** — Under Test, In-process and
Finished Product were not part of the request and are untouched, still on
the original compact 4in×3in brand-styled layout below.

The reference turned out to be **a 6-up A4 sheet** — 2 columns x 3 rows of
the identical label, for printing a batch's run of labels on one sheet and
cutting them apart — not a single-label page (an initial reading of the
reference read it as a 4-up sheet; Ravi's own screenshot of the template
plus a re-check of the `.doc`'s table structure, 3 rows x 2 cols on an A4
page, corrected this the same day). Ravi separately asked that the JPEG
export match the PDF's format and size too, not just look similar — both
now render from the same shared layout numbers (see below), including all
6 cells.

Measurements were taken off the reference throughout, not eyeballed: the
`.doc` was converted with LibreOffice (`soffice --headless --convert-to
pdf/docx`), inspected structurally with `python-docx` (page size/margins,
table row/column count and widths, font, size, bold, cell margins) and
rasterized at 200 DPI for pixel-level measurement of both a single cell
and the full-page grid (line/column boundary detection by dark-pixel
density, clustered into border positions).

- **Page / grid**: A4 (210mm × 297mm), 2 columns × 3 rows, grid origin at
  (17.02mm, 5.08mm) from the page's top-left, each cell 87.9mm × 96.0mm —
  all measured directly off the rasterized reference page, cross-checked
  against the `.doc`'s table column-width/row-height XML (`tblLayout
  type="fixed"`) and found consistent to within ~0.5mm.
- **Per-cell content**: identical across all 6 cells — the selected
  batch's fields repeated, matching how the reference sheet itself is a
  repeated single template, printed for one batch's full label run.
- **Font**: the reference specifies Calibri, bold, every run. Calibri is a
  proprietary Microsoft font not licensed for redistribution/embedding, so
  this embeds **Carlito** instead (`lib/fonts/carlito-bold.ts`) —
  metrically identical to Calibri by design, SIL Open Font License 1.1, and
  literally what LibreOffice substituted when rendering the reference (so
  the pixel measurements are Carlito's own metrics, not an approximation
  of Calibri's). The same TTF is embedded a second time as a CSS
  `@font-face` (data URI) in the on-screen preview/JPEG path, so both
  outputs use the identical typeface.
- **Colors / border**: plain black text on a thin black hairline border per
  cell — no brand green, unlike the other three templates.
- **Field prefixes**: reproduced as literal strings including their
  original padding spaces (e.g. `"Purchased From :"` vs `"Batch No.           :"`)
  exactly as extracted from the reference's runs — this is what reproduces
  the reference's colon alignment in the same font, rather than
  recomputing alignment. A couple of the app's own field labels differ
  slightly in wording from the reference's printed prefix (no slash in
  "Invoice/Ch. No." → prints as "Invoice Ch. No.", "Date of Receipt" →
  prints as "Date Of Receipt") — `RM_FIELD_PREFIX` maps app label to
  reference prefix explicitly.
- **Line positions**: each field's baseline Y position within a cell
  (`RM_FIELD_Y_MM`) was measured off the rasterized reference and verified
  numerically (band detection + line-pitch comparison), not just
  eyeballed.
- **"Mfg. Lic. No. : PD/AYU-111"**: the reference renders the label at 13pt
  and the license number at 11pt, on one shared baseline, both runs
  centered as a unit. jsPDF only centers a single run, so the PDF path
  measures both runs' widths (`getTextWidth`) and centers them manually;
  the HTML preview gets the same effect natively via a flex row with
  `align-items: baseline` + `justify-content: center`.
- **Deliberate deviation — company name/address text**: the reference's own
  text has an apparent copy/paste artifact — `"Atharva Nature Healthcare
  Pvt,Ltd.Wagholi"` on one line (comma instead of period, no space, address
  run onto the name) and `"Pune"` alone on the next. Rather than reproduce
  that glitch, this renderer uses the app's canonical `COMPANY_NAME` /
  `COMPANY_ADDRESS` constants from `lib/pdf.ts` (`"Atharva Nature
  Healthcare Pvt. Ltd."` / `"Wagholi, Pune"`) in the same two-line
  position/font/size. Flagged explicitly for Ravi since "pixel perfect" was
  the instruction — happy to switch to the literal reference text if he
  prefers it reproduced as-is.

### Implementation notes

`generate-label-pdf.ts` exports the grid/cell layout constants and
`buildRmLines(fields)` (the ordered per-cell line/run list) so the PDF
renderer (`downloadApprovedRmLabel` → `drawRmCell`, looped over all 6 grid
positions) and the on-screen/JPEG renderer (`rm-sheet-preview.tsx`'s
`RmSheetPreview`) are both driven from the same numbers rather than two
hand-tuned layouts that could drift apart.

`RmSheetPreview` renders at a fixed native width (794px, ~A4 at 96 CSS
px/inch) converting every mm measurement to px against that width; on
screen it's displayed scaled *down* to fit the Preview card via a CSS
`transform` on a wrapper `div` — not on the previewed node itself, so
`html2canvas`'s capture (in `label-picker.tsx`, `scale: 3`) reads the
node's own unscaled layout and the JPEG comes out at full export
resolution regardless of how small the on-screen card is. CSS can't
position text by baseline the way jsPDF's `text()` does, so single-run
lines are positioned with an empirically-chosen offset
(`BASELINE_OFFSET_FACTOR`) rather than the pixel-verified baselines the
PDF uses — close enough for a shareable raster copy; the PDF remains the
source of print-accurate positioning.

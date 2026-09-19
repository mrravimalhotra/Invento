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

### Bug fix — values overflowing the cell border (19 Sept 2026)

Ravi hit real batch data ("Aditya Ayurvedic Supply co" as Purchased From)
printing past the label's right border, both in the PDF and the JPEG.
Two separate things were going on, both now fixed:

1. **No shrink-to-fit for long values.** The original field-line rendering
   just concatenated `prefix + value` into one fixed-11pt string with no
   width check — any value long enough (a long vendor name, a long batch
   code) would run past the cell's right edge with no fallback.
   `fitRmValueRun()` in `generate-label-pdf.ts` now measures each value
   against the width actually left over after its prefix (cell width minus
   left/right margins minus the prefix's own width, using the real Carlito
   metrics) and shrinks the value's font size to fit, down to a 7pt floor;
   if it's still too long even at 7pt, it's truncated with an ellipsis
   rather than left to bleed off the label. `buildRmLines()` now takes a
   `jsPDF` instance (font already selected) purely to measure with, so the
   PDF path and the HTML preview path make the identical shrink/truncate
   decision for the same data — `rm-sheet-preview.tsx` builds its own
   throwaway (never rendered) jsPDF instance for this.
2. **A font-loading race in the JPEG path specifically.** Investigating
   Ravi's exact reported string turned up something more interesting: at
   Carlito's real metrics, `"Purchased From :  Aditya Ayurvedic Supply
   co"` measures 73.5mm — comfortably inside the ~83.9mm budget, no shrink
   needed. But measured in a generic fallback bold sans-serif, that same
   string is 86.1mm — which, added to the 2mm left margin, exceeds the
   87.9mm cell width. The preview's Carlito `@font-face` was declared
   passively in a `<style>` tag, which browsers only start fetching once
   layout actually needs to paint text with it — there was no guarantee it
   had finished loading by the time `html2canvas` fired, so the JPEG could
   capture a frame still on the fallback font. `loadRmCarlitoFont()` (in
   `rm-sheet-preview.tsx`) now loads the same embedded TTF explicitly via
   the CSS Font Loading API (`new FontFace(...).load()`), kicked off as
   soon as the preview mounts and awaited again immediately before
   `html2canvas` runs in `label-picker.tsx` — so capture can't proceed on
   the fallback font. The shrink-to-fit fix (above) is a real, independent
   improvement for genuinely long values either way — this second fix
   addresses why Ravi's reported value, which didn't actually need
   shrinking, still overflowed.

### Follow-up bug fix — company name touching the top border (19 Sept 2026)

After the fix above, Ravi reported the overflow was still happening — but
his follow-up screenshot showed it wasn't a horizontal overflow at all:
the ascenders of "t", "h", "l" in "Atharva Nature Healthcare Pvt. Ltd."
were touching/poking through the cell's *top* border. This traced back to
the original reference measurement pass having derived every line's
baseline Y position from the *visual band* (topmost/bottommost dark pixel
of that line) without correcting for ascenders/descenders — reasonably
close for line-to-line *spacing* (which is why it passed the earlier pitch
check) but not accurate for the *first* line's clearance from the cell's
top edge, which is exactly where the error was most visible.

Re-derived properly this time: rasterized the reference at 600 DPI (3x the
original pass), measured each line's ink bounding box (topmost/bottommost
dark pixel, cell-relative to the measured top border row), and combined
that with Carlito's own font-file metrics (glyph ink bounding boxes read
via `fontTools`, e.g. "h"/"l" ascend to 0.702em, "g"/"p"/"y" descend to
about -0.16 to -0.17em) to convert each line's ink box into its true
baseline — correctly accounting for which specific letters (not just
"has an ascender" vs not) are present in the reference's own text for that
line, including its already-filled-in "Status : Approved" value. All 13
line positions (4 header lines + 9 field lines) in `generate-label-pdf.ts`
were updated to these corrected baselines; verified by rasterizing the
corrected output at 600 DPI and confirming a clear gap above the
company-name line (and no new bottom-of-cell overflow either) on both the
PDF and the shared HTML/JPEG rendering path.

### Extra top margin + JPEG temporarily disabled (19 Sept 2026)

Even after the fix above, Ravi felt the gap above the company name still
looked too tight and asked to "bring text little down by adding some
space between top border and header." `RM_TOP_MARGIN_EXTRA_MM` (2.0mm) in
`generate-label-pdf.ts` now shifts the whole content block down by this
much uniformly (applied once, at the end of `buildRmLines()`, to every
line) rather than only the first line — every line keeps its
reference-measured spacing relative to the others; only the margin above
the first line (and, incidentally, below Sign at the bottom, which had
plenty of slack to spare) actually grows. Kept as its own named constant
rather than folded into the measured `RM_FIELD_Y_MM`/header values, since
it's a deliberate design choice on top of those, not a measurement — easy
to tune again if Ravi wants more or less.

Ravi separately asked to remove the JPEG download for this label type "for
now," while the sheet layout is still being dialed in — the font-loading
race and the ascender-clipping bug were both specific to the JPEG/preview
rendering path. `label-picker.tsx` now hides the "Download JPEG" button
when `labelType === "approved_rm"` (`Download PDF` and the on-screen
preview are unaffected); the other three label types keep JPEG export
unchanged. The underlying `RmSheetPreview/loadRmCarlitoFont` machinery is
untouched, so re-enabling it later is just restoring that one button.

### Finished Product & In-process — pixel-perfect 6-up sheets (19 Sept 2026)

Ravi supplied two more reference templates —
`finish_products_GREEN_label_111.docx` and `in-process_label.docx` — and
asked: *"Apply similar formatting for Finished Product & In Process
Labels. Use attached as template for Finished Product and In Progress
Labels."* Same treatment as Approved Raw Material above: a dedicated 6-up
sheet PDF plus a matching HTML/JPEG preview, built from measurements taken
off the references (LibreOffice conversion + `python-docx` structural
inspection + 600 DPI pixel measurement, baselines cross-checked against
font-file glyph metrics via `fontTools` the same way as the ascender fix
above — not the flawed ink-band-only method from RM's first pass).

**Page/grid differs from RM.** Both references are US Letter (215.9 ×
279.4mm), not A4 — same 2-col × 3-row grid shape, but its own constants
(`FPIP_*` in `generate-label-pdf.ts`) rather than reusing `RM_*`. Measured
grid: origin (6.33mm, 25.46mm), 100.01mm-wide cells. Row height is
per-type — Finished Product has 10 lines per cell (67.03mm rows),
In-process has 9 (60.35mm rows) — sized to each type's own content, the
same way RM's cells are sized to its.

**One uniform font size.** Unlike RM (13pt headers / 11pt fields, a couple
of mixed-size lines), every line in both references — headers and fields
alike — measured out to a single uniform 11pt (`FPIP_FONT_SIZE_PT`); no
per-line size table needed. Baselines for all 19 measured lines (10 from
Finished Product, 9 from In-process) fit a single shared line pitch and
first-line offset via least-squares — `FPIP_LINE_PITCH_MM` (6.685mm) and
`FPIP_LINE0_Y_MM` (3.685mm) — with a max residual of 0.028mm across every
point, including cross-checking that both references' header lines land
within 0.02mm of each other despite differing field-line counts below.

**Font: Liberation Serif, not Carlito.** Both references specify Times New
Roman (bold, every run) — inherited from the document's default run
properties (`docDefaults sz=22` = 11pt) rather than an explicit per-run
override anywhere in either `.docx`. Times New Roman is a Microsoft-
licensed font not available for redistribution, so this embeds Liberation
Serif instead: the metrically-compatible, SIL OFL-1.1 licensed open
substitute (same lineage/approach as Carlito for Calibri on RM), and
confirmed to be what LibreOffice actually substituted when rendering both
references for measurement (`fc-match "Times New Roman"` → Liberation
Serif in this environment). New file: `lib/fonts/liberation-serif-bold.ts`
(same embedded-base64-TTF pattern as `carlito-bold.ts`), used by both the
PDF path and `fp-ip-sheet-preview.tsx`'s CSS `@font-face`.

**Horizontal layout has an indent RM doesn't.** The "Mfg. Lic. No." line,
and the centered title line below it, both carry the reference's own
0.5in (720 twips) first-line paragraph indent — confirmed in the pixel
measurements (both land 12.7mm further right than the unindented lines
above/below them), and reproduced as `FPIP_INDENT_MM`. The centered title
line turned out to be centered *within that indented region*, not the
full cell width — its measured center matches `(indent-start +
cell-right-margin) / 2` to within 0.02mm, not the cell's own midpoint.
`drawFpIpCell()`/`FpIpSheetPreview` model this with a third horizontal
mode (`"center-indent"`, alongside `"left"` and `"left-indent"`) rather
than RM's plain `"center"` vs `"left"`.

**One shared preview component for both types.** `fp-ip-sheet-preview.tsx`
serves both Finished Product and In-process (unlike RM, which is its own
single type) since they're otherwise structurally identical — same page,
grid, font, column positions — differing only in title text, field
list/prefixes, and cell height, passed in as props
(`FpIpSheetPreviewProps`). `loadFpIpLiberationSerifFont()` uses the same
explicit Font Loading API pattern as `loadRmCarlitoFont()` from the start,
to avoid RM's font-loading-race bug rather than rediscover it.

**Deliberate deviations from the reference's literal text**, same
rationale as RM: both references run the company name and address onto
one line as `"Atharva Nature Healthcare Pvt. Ltd.,Wagholi, Pune."` (comma
with no following space) and give the Mfg. Lic. No. with a slash
(`"PD/AYU/111"`) rather than the app's canonical dash (`"PD/AYU-111"`).
This renders the canonical `COMPANY_NAME` / `COMPANY_ADDRESS` /
`MFG_LIC_NO` constants in the same one-line position instead.

**In-process's reference table starts ~14.6mm further down the page than
Finished Product's** — traced to 3 stray empty paragraphs above its table
in that one source document (confirmed via the raw document XML), not
present in the Finished Product reference and not matched by any other
structural difference between the two. Read as a copy/paste artifact
rather than an intentional difference, so both label types share the same
`FPIP_GRID_ORIGIN_Y_MM` (both sheets' grids start at the same point on the
page) rather than In-process inheriting that offset — flagged here rather
than silently normalized.

**JPEG stays enabled** for both new types (unlike RM, which currently has
it removed "for now" — see above). Nothing about this build reproduces
RM's original bugs (the font-loading race is avoided from the start here,
and every baseline already has correct ascender clearance from the
references' own measurements), so there was no specific reason found to
disable it; flagged to Ravi as a default worth confirming, not a silent
choice.

Verified the same way as RM's fixes: rendered both PDFs from realistic
sample data (script not kept in the repo), rasterized at 600 DPI, and
numerically compared line positions against the reference measurements —
max deviation 0.17mm across every line in both label types, and confirmed
a long-value stress test (long product name, long batch code, long
quantity string) shrinks/truncates correctly without overflowing any
cell's border.

### Under Test — pixel-perfect 10-up sheet, from an inconsistent reference (19 Sept 2026)

Ravi: *"do same for under test labels."* This time the reference —
`RM  UNDER TEST LABEL.docx` — wasn't attached to the chat; it turned up
in Ravi's "Invento Requ" folder (the same source
`requirements-gap-analysis.md` lists it from, alongside the other three).

**This reference is qualitatively different from the other three: it's
internally inconsistent, not a clean single-cell design.** It's 5 table
rows × 2 cols (10 cells) on **US Legal paper** (215.9 × 355.6mm) — not the
6-up A4/Letter grids of RM/FP/IP — and the 5 rows alternate between two
different cell contents:
- 3 rows: the full 7 fields ending in "Sign" ("Name of RM/FP", matching
  the app's existing `under_test` field list exactly).
- 2 rows: missing the Sign line entirely, say "Name of RM" instead of
  "Name of RM/FP", and have a stray leftover "RM" typed into the Batch
  No. value (`"Batch No.      :  RM "`) — reads as an abandoned
  copy/paste edit, not a second intentional format.

One cell also has an outright typo: `"Sign                    ::  "` (a
double colon) where every other Sign line has one colon.

**Asked Ravi before writing any code** (`AskUserQuestion`, since this is
genuinely ambiguous rather than a matter of judgment): which cell variant
is the real template, and whether to replicate the reference's own
Legal-size/10-cell layout or normalize it to RM's 6-up A4 the way the
page-size question was decided for Finished Product/In-process. Answer:
*"Use attached template as reference. Print 10 labels per page as in the
template"* — confirms the reference's own 10-per-page Legal layout, and
(combined with the 7-field variant being both the more complete design
and the one already matching the app's field list) the complete
"Name of RM/FP" cell is what gets built, uniformly, in all 10 positions —
not the alternating pattern.

**Measured the same way** as the other three: LibreOffice conversion,
python-docx structural inspection, 600 DPI pixel measurement of all three
"complete" rows (0, 2, 4 — cross-checked against each other, 30 baseline
points total), baselines corrected via Liberation Serif's `fontTools`
glyph metrics. Grid: origin (11.45mm, 6.65mm), 93.1mm-wide × 67.17mm-tall
cells (`UT_*` constants). Font size is the familiar uniform 11pt
(`UT_FONT_SIZE_PT`); line pitch 6.686mm, first-line baseline 3.748mm from
cell top (`UT_LINE_PITCH_MM` / a private line-0 offset), least-squares
fit with a 0.145mm max residual across all 30 points.

**Font weight is genuinely mixed here, unlike RM/FP/IP.** Only the
company-name and "UNDER TEST" title lines are bold; the Mfg. Lic. line
and all seven field lines are regular weight — confirmed from the
reference's own run properties (no `<w:b/>` on those runs). Both weights
are embedded: `lib/fonts/liberation-serif-bold.ts` (reused from
Finished Product/In-process) and the new
`lib/fonts/liberation-serif-regular.ts`. `UtLine`/`buildUtLines()` carry
a `bold` flag per line so `drawUtCell()` and `UtSheetPreview` select the
matching weight before drawing/measuring.

**Horizontal layout is simpler than FP/IP's.** Only two paragraph
alignments are actually in play — "center" (company name, title; centered
within the full cell width, no indent trick) and "left" (field lines,
`UT_LEFT_PAD_MM`). The Mfg. Lic. line's rightward shift doesn't come from
FP/IP's paragraph-indent-plus-centering mechanism; in this reference it's
a left-aligned line whose text run itself has 10 literal leading spaces
on top of a 0.5in paragraph indent. Rather than reproduce that mechanism
(baking literal spaces into the string), this reproduces the *resulting
pixel position* directly as a single measured offset,
`UT_MFGLIC_INDENT_MM` (21.81mm beyond `UT_LEFT_PAD_MM`) — the position is
what has to match, not how the source document arrived at it.

**Deliberate deviations from the reference's literal text**, same
rationale as RM/FP/IP: the reference's company-name line has the same
"Pvt. Ltd, Wagholi,Pune." run-on as FP/IP, and gives the Mfg. Lic. No.
with a slash (`"PD/AYU/111"`, in the 3 "complete" rows — the 2 "broken"
rows actually use the canonical dash) rather than the app's canonical
dash. Renders `COMPANY_NAME` / `COMPANY_ADDRESS` / `MFG_LIC_NO` instead,
identically to how FP/IP compose their header line.

**JPEG stays enabled**, consistent with the Finished Product/In-process
decision (same reasoning: nothing here reproduces RM's original
font-race bug, since the Font Loading API is used from the start).

With this, `label-picker.tsx`'s old generic single-label brand-styled
preview (the `dl`-based fallback at the bottom of the Preview card) is no
longer reachable by any label type — all four now have a dedicated sheet
preview — and has been removed, along with the now-unused `LABEL_HEADER`
constant it was the last user of (`HEADER_TEXT`, exported from
`generate-label-pdf.ts`, is the single source of truth for header text
across all four types now).

Verified the same way as FP/IP: rendered sample + long-value stress-test
PDFs, rasterized at 600 DPI, numerically compared against the reference
measurements — max deviation 0.043mm across every line — and confirmed
the long-value stress test shrinks/truncates cleanly with no overflow.

## JPEG download removed from all four label types (19 Sept 2026)

Ravi: *"remove jpg download from all four labels printing"*. JPEG had
already been hidden for Approved Raw Material specifically ("Remove jpg
download option for now", while that sheet's layout was still being
dialed in — see above); this removes it for the remaining three
(Finished Product, In-process, Under Test) as well, so no label type
offers a JPEG export any more. Only "Download PDF" remains.

Removed from `label-picker.tsx`: the `previewRef` ref, `downloadingJpeg`
state, the `handleDownloadJpeg` function (html2canvas capture, font-load
awaiting, `.jpg` download link), the conditionally-rendered "Download
JPEG" button, and the `ref={previewRef}` prop on each of
`RmSheetPreview`/`FpIpSheetPreview`/`UtSheetPreview`. The `html2canvas`
dependency itself is left in `package.json` (unused for now, cheap to
leave, one less file to touch) rather than removed.

The three sheet preview components (`rm-sheet-preview.tsx`,
`fp-ip-sheet-preview.tsx`, `ut-sheet-preview.tsx`) are unchanged apart
from comment cleanup — they're still needed for the on-screen "2.
Preview" card the user sees before downloading the PDF, independent of
JPEG capture. In particular their exported `loadXxxFont()` functions stay:
each component still calls its own loader from a `useEffect` on mount, to
avoid the on-screen preview briefly painting with a fallback font before
the embedded Liberation Serif/Carlito TTF loads (the same font-race class
of bug as the original RM "letters going out of border" issue, just for
on-screen accuracy now rather than capture accuracy).

Verified with `tsc --noEmit`, `eslint`, and a full `next build` — all
clean, no other consumer of `previewRef`/`downloadingJpeg`/
`handleDownloadJpeg` remained, and no other file dynamically imports
`html2canvas` any more.

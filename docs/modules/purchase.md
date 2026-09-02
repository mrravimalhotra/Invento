# Module 5 — Purchase

Cross-reference: `docs/DESIGN.md` §4.4 (schema), §7.1 (workflow spec).

## This closes the review's #1 headline gap: Automatic Sampling Deduction

The baseline's biggest single finding (spec.md) was that QC / Stability / R&D
sample quantities taken at goods receipt never got subtracted from what the
system reported as available stock — a batch showed its full received
quantity as "in stock" even after part of it was pulled out for testing.

This module closes it in three places at once, not just one:

1. **The Purchase Line form pre-fills `qc_qty` / `stability_qty` / `rnd_qty`**
   from the selected item's `default_qc_qty` / `default_stability_qty` /
   `default_rnd_qty` (Item Master) the moment an item is chosen, so the
   deduction happens by default instead of relying on the data-entry clerk to
   remember it — still fully editable/overridable per line, since real
   receipts sometimes differ from the item's usual sampling amount.
2. **`remaining_qty` is a Postgres generated column**
   (`quantity - qc_qty - stability_qty - rnd_qty`, `stored`, with a
   `remaining_not_negative` check constraint) — it is derived by the
   database itself from the row's own numbers, not computed and posted by
   application code, so it cannot drift out of sync with a client bug or a
   half-finished form.
3. **The ledger push (`trg_purchase_line_push`, `0002_transactions.sql`)
   uses `remaining_qty`, not `quantity`**, as the amount pushed onto
   `inventory_ledger` the instant a purchase line is inserted. The sample
   portion simply never enters the "available for production" balance
   (`stock_balance` view) in the first place — this module's Server Action
   never writes to the ledger directly (per AGENT_BRIEFING.md — writes are
   blocked by RLS on that table on purpose); the trigger does it atomically
   in the same transaction as the insert.

The Purchase Line detail table also makes the fix visible, not just present
in the database: each line shows quantity and remaining quantity together
("120 kg (of which 100 kg remaining after QC/Stability/R&D)") rather than
only the received quantity.

## Screens

| Route | Purpose |
|---|---|
| `/purchase` | List of purchase orders — PO number, vendor, invoice number/date, line count, total value (line totals summed via a nested `purchase_lines` select, computed client-render-side in the Server Component). |
| `/purchase/new` | Create a PO header — vendor (dropdown), invoice number, invoice date. `po_number` is assigned automatically. |
| `/purchase/[id]` | PO header (read-only — no edit screen in this pass, matching baseline scope) + a table of its lines + an "Add line" form below, gated to users with write access. |

## Fields

**Purchase order (header):** `po_number` (auto, `get_next_po_number()` — new
vs. the old baseline, which had no PO number at all), `vendor_id`,
`invoice_number`, `invoice_date`.

**Purchase line:** `item_id` (dropdown of `items` where `category = 'raw'`
and `active = true`), `batch_number` (auto, `get_next_batch_number(item_id)`
— called the moment the item is selected via a small read-only preview
Server Action, `previewBatchNumber`, and shown disabled before submit; the
insert itself calls the same RPC again server-side rather than trusting the
previewed value, so the stored number is always freshly derived, never
client-supplied), `quantity`, `unit` (defaulted from the item's own unit,
still editable), `qc_qty` / `stability_qty` / `rnd_qty` (pre-filled from the
item's defaults as above), `unit_price`, `gst_pct`, `expiry_date`
(required). `remaining_qty` is never sent on insert — it is DB-generated and
simply re-fetched (via `revalidatePath` + the page's own read) and displayed.

GST amount, price incl. GST, and line total are computed live in the browser
as the user types in the "Add line" form (plain client-side arithmetic, not
stored columns — matches the old baseline's behavior) and are recomputed the
same way for already-saved lines when the detail page renders them, so the
same numbers are consistent whether a line was just added or loaded from the
database.

## Role

Write (PO header and lines) requires the `purchase` module key —
`system_admin` or `inventory_manager`, matching `MODULE_WRITE_ROLES.purchase`
and the `po_write` / `pl_write` RLS policies in `0001_init.sql`.
`previewBatchNumber` (the read-only batch-number preview) is also gated the
same way even though it performs no write, to keep it consistent with the
rest of the module's access rule.

## Files

- `lib/actions/purchase.ts` — `createPurchaseOrder`, `previewBatchNumber`,
  `createPurchaseLine` (Zod-validated, `use server`).
- `app/(dashboard)/purchase/page.tsx`, `.../new/page.tsx`, `.../[id]/page.tsx`
- `app/(dashboard)/purchase/purchase-order-form.tsx` — PO header create form.
- `app/(dashboard)/purchase/purchase-line-form.tsx` — line add form: item
  select drives batch-number preview + default pre-fill; live GST/total
  calculation.

## Deviations from the briefing / DESIGN.md

- DESIGN.md §4.4 lists a `qc_status` generated column on `purchase_lines`
  ("superseded by view, see §4.5"); the actual migration (`0001_init.sql`)
  does not create that column at all — QC status is served entirely by the
  `purchase_batch_status` view instead, which is what §4.5 says supersedes
  it. This module was built against the migration as it stands (no
  `qc_status` column exists to display), per AGENT_BRIEFING.md's instruction
  not to invent columns; flagging the doc/migration mismatch here rather
  than silently working around it.
- The list screen's "total value" and each line's GST amount / price incl.
  GST / line total are computed from `quantity × unit_price`, i.e. the
  invoiced/received value — not from `remaining_qty` — since these are
  financial (invoice) figures, distinct from the stock-availability fix
  above. Worth confirming with Ravi/Atharva that this matches the legacy
  "total value" meaning on the PO list.

## Batch number race fix (1 Sept 2026)

Found during a full-app integrity audit (`claude/known-issues.md`):
`get_next_batch_number()` computes the next number from a `count(*)` query,
then `createPurchaseLine()` inserts the row as a separate round trip —
nothing serialized the two, so two people entering a purchase line for the
same item on the same day could compute and save the same batch number,
silently duplicating a GMP-critical traceability field.

`0013_batch_number_integrity.sql` adds a **partial** unique index on
`(item_id, batch_number)` — `where batch_number not like 'LEG-%'` — as the
real backstop, so any future app-generated collision raises `23505`
instead of writing a silent duplicate. `createPurchaseLine()` wraps the
get-number/insert pair in a retry loop (up to 3 attempts): on a `23505` it
calls `get_next_batch_number()` again (which now accounts for whichever
request won the race) and retries the insert, only surfacing an error to
the user if all attempts collide.

The index is scoped to exclude `LEG-` prefixed batch numbers on purpose: a
first attempt at a table-wide constraint failed to apply against
production because legacy batch numbers are free text with no uniqueness
guarantee, and at least one real collision already exists there (two
genuinely different 2016 purchase lines, `LEG-PR-40`, six months apart).
Fixing that retroactively would mean deleting a row with a linked
`inventory_ledger` entry — real transaction history, and a change to that
item's current computed stock-on-hand — not worth it for a race that only
ever affects new, app-generated codes. Legacy data is left exactly as
imported.

## FB-0007 / FB-0009: searchable dropdowns, legacy-aware (1 Sept 2026)

"in vendor text box, should be serach functionality..." / "add serach &
autocomplete functionality in item drop down." Both close for free —
`Select` (`purchase-order-form.tsx`'s vendor picker, `purchase-line-form.tsx`'s
item picker) is now a type-to-filter combobox app-wide, see DESIGN.md §8.
Both pickers' options are also marked `data-legacy` from `vendor_code` /
`item_code` respectively, so FB-0008 ("legacy items should not come to
[search] functionality if legacy item flag is set to hidden") is covered
too — no server query changes needed here, both already selected the code
column.

## Bug fix: new raw materials missing from item picker (1 Sept 2026)

Reported by Ravi with a screenshot: newly-created raw materials weren't
appearing in the Purchase "Add line" item combobox at all — not even by
searching. Root cause: `purchase/[id]/page.tsx`'s raw-items query had no
`.limit()`/`.range()`, and PostgREST/Supabase silently caps an unbounded
`select()` at a server-side default row count. The query was ordered by
`item_code` ascending, and legacy codes (`LEG-RM-...`) sort alphabetically
before v2 codes (`RM-...`) — with ~2,000+ raw materials on file, the cap
was very likely being filled entirely by legacy rows before the query ever
reached a `RM-`-prefixed item, so every item created after the legacy
import was invisible to this picker regardless of search term (the combobox
only searches what the server actually returned).

Fixed by switching the query's order to `created_at descending` — same
pattern already established for the Items list page (FB-0006) — so newly
created items are always among the rows returned, capped or not. This is a
pre-existing bug that predates this session's combobox/legacy-toggle work;
it only surfaced now because the new searchable pickers made testing with
freshly-created items more direct. See `claude/known-issues.md` for the
full sweep of every query with this same shape.

## FB-0016: stray comma in the item dropdown (2 Sept 2026)

"',' is appearing after Item Code and before Item Name in the item drop
down. ... Item code and item name should be divided by '-'." Root cause
was **not** Purchase-specific — it was a bug in the shared combobox
component itself (`components/ui/combobox.tsx`'s `optionsFromChildren()`):
an `<option>` written as `{item.item_code} — {item.name}` hands React's
`children` prop an *array* (`["RM-00002", " — ", "Ashwagandha"]`), not a
string, since it has more than one JSX child. The old label-extraction
code only handled the single-string case and fell back to
`String(props.children)` otherwise — which for an array runs
`Array.prototype.join(",")`, silently inserting a stray comma next to the
intended " — " separator. Fixed at the root with a `childrenToText()`
helper that walks the children tree and concatenates every text leaf
directly, so whatever separator text is already in the JSX source is
preserved exactly.

Because the fix lives in the shared component, it also silently corrected
the same bug in every other picker built the same way: Packaging's item
picker, MFR's recipe-line item picker, the RM/FP batch pickers on Labels,
COA's QC picker, Finished Product's MFR and RM-batch pickers — none of
these had a filed ticket, but all had the identical stray-comma symptom.

## FB-0017: real unit conversion for QC/Stability/R&D quantity (2 Sept 2026)

"unit should be defaulted to the unit defined at the time of creating Item
Master record" was already true (the line's `unit` field pre-fills from
the selected item's own `unit` — see the Automatic Sampling Deduction
section above). The actual ask was the second half: "QC, Sample and R&D
quantity should have option to choose smaller units," matching Item
Master's `default_sample_unit` field.

`default_sample_unit` (0007_item_code_fp_and_sample_unit.sql) was shipped
deliberately **display-only** — flagged in that migration's own comment as
an intentional scope decision, since no unit-conversion table existed
anywhere in the schema and `qc_qty`/`stability_qty`/`rnd_qty` share one
`unit` column with `quantity`, feeding the generated `remaining_qty`
column. The Purchase line form only showed a warning telling the user to
convert the numbers by hand before saving.

Closed properly this pass:
- `lib/constants/units.ts` gains `unitFamily()`, `compatibleUnits()`, and
  `convertUnit()` — two convertible families (weight: mg/g/kg; volume:
  ml/ltr) plus each of `count`/`bottle`/`pack` as its own one-member
  family (a "pack" has no fixed gram-equivalent, so it's never converted
  to or from anything else, including another pack-like unit).
- The Purchase line form gained a real **"Sample unit"** picker (shared by
  QC/Stability/R&D qty, same "one unit for all three" convention as Item
  Master), defaulting to the item's `default_sample_unit` when that's
  convertible into the line's unit, falling back to the line's own unit
  otherwise. Its option list is restricted to `compatibleUnits(unit)`, and
  it resets automatically if the line's own unit changes to an
  incompatible family. Each qty field's hint now shows the live-converted
  amount (e.g. "= 0.5 kg") instead of a "convert by hand" warning.
- `createPurchaseLine()` (`lib/actions/purchase.ts`) converts
  `qc_qty`/`stability_qty`/`rnd_qty` from the submitted `sample_unit` into
  the line's `unit` via `convertUnit()` **before** the
  qc+stability+rnd ≤ quantity bounds check and before the insert — the
  bounds check moved out of the zod schema's `.refine()` into hand-written
  logic since it now depends on a conversion, not just the raw form
  values. A conversion returning `null` (units not in the same family —
  shouldn't happen given the UI's restricted option list, but checked
  defensively) surfaces a friendly error rather than silently storing the
  wrong number.
- No schema change: the final converted numbers are stored in
  `qc_qty`/`stability_qty`/`rnd_qty` exactly as before, still in the
  line's own `unit` — only how they're *entered* changed.

## FB-0015: admin-only delete for purchase records (2 Sept 2026)

"admin should be able to delete purchase records." Extends the same
admin-only delete pattern already used for Item Type/Item/Vendor/MFR
Master to Purchase — `deletePurchaseOrder()` in `lib/actions/purchase.ts`,
gated `system_admin` only (direct role check, same convention as
`deleteItem()`), backed by `0018_purchase_delete_policy.sql` (splits the
old `po_write`/`pl_write` "for all" RLS policies into insert/update
unchanged + a `system_admin`-only delete policy on each).

`purchase_lines.purchase_order_id` is `on delete cascade`, so deleting a
purchase order also removes all of its lines in the same transaction — no
separate "delete a line" action exists or was requested.
`quality_checks.purchase_line_id`, `finished_product_components.
purchase_line_id`, `bmr_weighment_lines.purchase_line_id`, and
`inventory_ledger.purchase_line_id` all reference `purchase_lines(id)`
with no cascade of their own, so the moment any line in the order has been
QC'd, consumed by MFR/BMR, or has ledger activity, the cascade hits a
foreign-key violation (`23503`) and the whole delete rolls back — nothing
partial is ever left behind. `deletePurchaseOrder()` translates that into
"Can't delete — one or more lines on this purchase order have QC,
production, or inventory records on file," the same friendly-message
convention as every other admin delete in the app. In practice this means
only a purchase order that's genuinely untouched downstream (the ticket's
actual use case — a mistaken entry) can ever be deleted.

Delete UI: `DeletePurchaseOrderForm` (two-step-confirm, same pattern as
`DeleteItemForm`/`DeleteMfrForm`), rendered admin-only above the Purchase
lines table on the PO detail page.

**Scope limitation found live 2 Sept 2026, resolved by FB-0018 below (new
POs only):** before FB-0018, every purchase line pushed to
`inventory_ledger` the instant it was inserted (§7.1), so in practice a PO
could only ever be deleted before any line was added to it at all — see
"Fourth pass" in `claude/known-issues.md`. Since FB-0018 defers that push
until Final Submit, a **draft** PO now has zero ledger rows behind any of
its lines and deletes cleanly, no matter how many lines it has, right up
until it's submitted. A PO that predates FB-0018, or that has since been
Final Submitted, still correctly can't be deleted once it has genuine
downstream activity — that's unchanged and is the intended behavior, not
a bug.

## FB-0018: draft → Final Submit workflow (2 Sept 2026)

"there should be a final submit button post which the record should be
committed. Before that all users should have access to review/edit
entered record." The architecturally significant one — scoped with Ravi
via four explicit decisions before any code was written: (1) a draft PO's
lines defer touching inventory entirely, rather than pushing immediately
and reconciling later; (2) once submitted, only `system_admin` can Reopen
(not any write-role user); (3) Final Submit is whole-PO, not per-line; (4)
three smaller tickets found in the same pass (FB-0019/0020/0021) were
folded into this same delivery. Full mechanism: `docs/DESIGN.md` §7.5 and
§4.4; this section covers the app-level pieces.

**New in `purchase_orders`:** `status` (`'draft' | 'submitted'`,
`0019_purchase_submit_workflow.sql`), `submitted_at`/`submitted_by`,
`reopened_at`/`reopened_by`. **New in `purchase_lines`:** `pushed_at`
(null until this specific line has actually reached `inventory_ledger`).
Every purchase order/line that existed before this migration was
explicitly backfilled to `submitted`/pushed as of its own real
`created_at`/ledger `event_at` — nothing about historical stock changed,
only purchase orders created after the migration start as `draft`.

**Line-level review/edit, while draft:**
- `PurchaseLinesSection` (new, `app/(dashboard)/purchase/[id]/`) lifts
  "which line is being edited" above both the lines table and the
  Add-line form — clicking Edit on a row swaps the Add-line form for a
  pre-filled `EditPurchaseLineForm` (new component in
  `purchase-line-form.tsx`) in the same spot; Cancel or a successful save
  swaps it back.
- `updatePurchaseLine()`/`deletePurchaseLine()` (`lib/actions/purchase.ts`),
  same write-role gate as `createPurchaseLine` (`system_admin`,
  `inventory_manager`), both refuse with "Reopen it first" once the
  parent PO's status isn't `draft` — checked server-side via an embedded
  `purchase_orders!inner(status)` select, not just hidden in the UI.
  `updatePurchaseLine` deliberately does **not** allow changing Item,
  Batch number, or Unit: batch numbers are per item/year (changing the
  item after one's been generated would need to silently regenerate it),
  and Quantity/QC/Stability/R&D are stored as plain numbers against
  `unit` — relabeling it without converting the stored values would
  silently mislabel real data. Delete UI is a compact two-step-confirm
  button per row (`DeleteLineButton` in `purchase-lines-table.tsx`) — a
  native `confirm()` dialog was deliberately avoided (it blocks this
  session's own browser-automation verification tooling, see
  `claude/feedback-status.md` Notes), same reasoning as every other
  delete in the app.

**Final Submit / Reopen:** `submitPurchaseOrder()`/`reopenPurchaseOrder()`
(`lib/actions/purchase.ts`) call two new `security definer` RPCs
(`submit_purchase_order`/`reopen_purchase_order`, since clients can't
write `inventory_ledger` directly — `ledger_no_direct_write`,
`0001_init.sql`). Submit pushes every not-yet-pushed line's
`remaining_qty` in one transaction and flips the PO to `submitted`;
Reopen (system_admin-only, both in the RPC's own role check and the
Server Action) reverses whatever was pushed with a compensating `'pull'`
ledger entry for the **exact** quantity the matching `'push'` row
recorded (read back from the ledger itself, so it's correct even if a
line gets edited between submits) — the original row is never deleted or
edited, `inventory_ledger` stays a true audit trail — then clears
`pushed_at` so a later resubmit re-pushes whatever the (possibly-edited)
lines say at that time. UI: `SubmitPurchaseOrderForm` (one-click, no
confirm — Reopen is the built-in undo) shown to any write-role user once
the PO is draft and has at least one line; `ReopenPurchaseOrderForm`
(two-step-confirm — reversing committed inventory is a bigger action)
shown to `system_admin` only once submitted. Both live on the PO detail
page next to the existing Delete button; a Status card and a Status
column on the `/purchase` list (Draft/Submitted) make the state visible
at a glance.

**Downstream pickers filtered to submitted-only:** since a draft line's
stock was never pushed, QC's "New Assign Record" batch picker (`/qc/new`)
and the Wastage form's batch picker (`/inventory/wastage/new`) both now
require `purchase_orders.status = 'submitted'` — otherwise a sample pull
or wastage event could be recorded against a batch that was never
actually on hand. Finished Product's FIFO candidates and BMR's
weighment-line picker were already restricted to QC-Approved batches,
which transitively requires having gone through the (now submitted-only)
QC picker, so neither needed a direct change — verified, not assumed. The
RM Stock report (`/inventory/rm-report`, an "as of a date" export of
`remaining_qty`) got the same filter for the same reason it did on the
QC/Wastage pickers. The Purchase Register report (`/reports`) and the
Labels page were deliberately left unfiltered — both are transaction
logs/print aids, not stock-availability claims, so a draft line appearing
there isn't a correctness bug.

Not built this pass, out of scope: a per-line submit/lock (Ravi chose
whole-PO); any UI for browsing a PO's push/reopen history beyond the
Status card's single "submitted on <date>" line (`submitted_at`/
`reopened_at` are on record in the schema if a fuller audit view is
wanted later).

## Packaging items are now purchasable — Raw Material / Packaging Item toggle (2 Sept 2026)

"In Purchase Screen - there should be option to choose Purchase Raw
Material or Packaging Item. For Packaging Item, no need to capture QC,
R&D or Stability Sample." Until this change, `/purchase` only ever
fetched `category = 'raw'` items — there was genuinely no way to buy more
packaging stock through the app. Packaging items only ever got inventory
from the legacy import's opening balances; Packaging Issue
(`/packaging/new`) has always only *consumed* existing stock, generically
by `item_id` (not tied to a specific purchase batch/FIFO the way
Finished Product's RM consumption is), so it needed no change here at
all — the moment packaging purchase lines exist, Packaging Issue and the
Wastage form (`/inventory/wastage/new`, which already fetched *all*
items/lines unfiltered by category) both pick them up automatically.

**Add-line / Edit-line forms** (`purchase-line-form.tsx`): a new "Purchase
type" `<Select>` (Raw Material / Packaging Item, defaults to Raw
Material) filters the Item dropdown to that category — the ~3,500 raw
items and ~80 packaging items are never mixed in one list. Switching it
resets item/batch/unit/sampling state, since a stale selection from the
other category shouldn't survive the switch. When Packaging Item is
selected, the QC qty / Stability qty / R&D qty / Sample unit fields (and
the "remaining after sampling" preview, which doesn't apply — packaging
is never sampled) are not rendered at all, not just hidden-but-submitted:
`createPurchaseLine()`/`updatePurchaseLine()` already default
`qc_qty`/`stability_qty`/`rnd_qty` to 0 and `sample_unit` to the line's
own unit when the form doesn't send them (pre-existing fallback logic,
`lib/actions/purchase.ts`), so no server-side change was needed for the
capture side — `remaining_qty` for a packaging line is simply the full
quantity received. `EditPurchaseLineForm` reads the same
`line.item.category` (now selected alongside `item_code`/`name` on both
the lines and items queries in `[id]/page.tsx`) so re-opening a packaging
line for edit doesn't offer sampling fields either.

**Batch number prefix** (`0023_packaging_purchase_batch_prefix.sql`):
`get_next_batch_number()` had the `'RM-'` prefix hard-coded regardless of
item category — a packaging purchase would otherwise have been assigned
a batch number like `RM-01/26`, wrong and inconsistent with the
`RM-`/`PKG-`/`FP-` item-code convention (`get_next_item_code()`,
`0007_item_code_fp_and_sample_unit.sql`). Rewritten to look up the item's
category and prefix `PKG-` for packaging, `RM-` otherwise. Pure function
replace, no data change — `purchase_lines_item_batch_unique`
(`0013_batch_number_integrity.sql`) is keyed on `(item_id, batch_number)`
regardless of prefix, so this doesn't touch that constraint or the
per-item/year counting logic, only the label.

**Consequential fix, found while scoping this (not separately
requested):** QC's "New Assign Record" picker (`/qc/new`) lists every
purchase line whose `purchase_batch_status.qc_status = 'not_submitted'`
— with no category filter, every packaging purchase line would have sat
there forever as "awaiting QC" (nothing ever creates a `quality_checks`
row for a packaging line), which is both misleading and would let
someone accidentally pull a QC sample from packaging stock — directly
contradicting "no need to capture QC... for Packaging Item." Fixed in
the same change: the query's `items` embed is now `items!inner(...,
category)` with `.eq("items.category", "raw")`, so only raw-material
batches are ever offered for QC assignment — matching what has always
implicitly been true (QC only ever applied to raw material) but was
never enforced, because packaging had no purchase path to test it
against until now.

See `docs/DESIGN.md` §4.4 and the Seventh-pass entry in
`claude/known-issues.md` for the destructive-vs-additive framing.

## Currency labels, financial renames, Expiry → Re-Test Date split (2 Sept 2026)

Per direct request, following the Packaging Item purchase path above:
"All unit Prices / amount to be denoted in ₹... Line total should be
renamed Total Cost (₹)... No need to show 'Expiry Date' for Packaging
Products. For Raw Material Rename Expiry Date to Re-Test Date."

**Currency labels and renames** (`purchase-line-form.tsx`,
`purchase-lines-table.tsx`, `purchase-table.tsx`, `[id]/page.tsx`): every
INR-denominated field/column/card label now carries `(₹)`: "Unit Price
(₹)", "Total value (₹)" (PO list and PO detail summary card). The
per-line summary panel (both Add-line and Edit-line forms, and the lines
table) was renamed and gained a new figure — all four now read:

- **Item Total Excl GST (₹)** — new; `quantity × unit_price`, previously
  shown nowhere on its own (only folded into GST amount/line total math).
- **GST amount(₹)** — was "GST amount".
- **Rate incl. GST(₹)** — was "Price incl. GST".
- **Total Cost (₹)** — was "Line total".

`line-financials.ts`'s `lineFinancials()` now returns `itemTotalExclGst`
(the base amount) alongside the existing `gstAmount`/`priceInclGst`/
`lineTotal`, so the new figure is computed once in the shared pure helper
rather than duplicated between the form and the table.

**Expiry Date → Re-Test Date, hidden for packaging:** the date field on
both purchase-line forms is now conditional on `category`:

- Raw material: still shown, relabeled "Re-Test Date", with a hint
  explaining the intended workflow — "Once this date arrives, the batch
  is due to go through QC again using its reserved stability sample."
- Packaging: not rendered at all — packaging items are never QC'd or
  retested, so there's no date to capture.

Server-side, `lib/actions/purchase.ts`'s `lineSchema`/`updateLineSchema`
changed `expiry_date` from always-required to optional at the Zod layer,
with the actual requirement enforced by hand in
`createPurchaseLine()`/`updatePurchaseLine()` after looking up the
line's real item category from the database (never trusting a
client-submitted category) — raw material still rejects a missing date
("Re-Test date is required for raw material."), packaging silently
stores `null`. This follows the same category-lookup pattern used for
the QC/Stability/R&D defaulting added for Packaging Item purchases
above: the client's `<Select>` state is a UX filter, never the source of
truth for what the server enforces.

**Migration** (`0024_purchase_lines_currency_retest.sql`): drops the
`not null` constraint on `purchase_lines.expiry_date` — purely additive,
every existing row (raw material only, to date) already has a real date.

**Consequential fix, found while scoping this (not separately
requested):** the Labels module's RM label picker query
(`/labels`, `page.tsx`) had no category filter on the purchase-lines
fetch — since packaging purchase lines now exist, they would have started
appearing in the "Approved Raw Material" / "RM Under Test" / "In-process"
picker there, all three of which are raw-material-specific label formats
(`requirements-gap-analysis.md`). Fixed by switching the `items` embed to
`items!inner(name, category)` with `.eq("items.category", "raw")` added,
matching the same fix already applied to the QC "New Assign Record"
picker when Packaging Item purchases were introduced. See
`docs/modules/labels.md`.

**Now built (2 Sept 2026, Eighth pass Part B) — see `docs/modules/qc.md`,
"Retest workflow."** The "should go through QC again using the stability
sample already available" workflow keys off `quality_checks.retest_date`
(a separate, pre-existing QC-computed field), not the
`purchase_lines.expiry_date`/Re-Test Date field this module renamed above
— that distinction was surfaced and confirmed with Ravi mid-build. This
module's own Re-Test Date field (Purchase screen, at receipt time) is
unchanged by that work. The Expiry→Re-Test terminology rename did
propagate to every other place `purchase_lines.expiry_date` is displayed
(QC's batch pickers were already this module's own field; BMR's
weighment batch picker, FP-compose's RM batch picker, the Purchase
Register report, and the Finished Product detail page's composition
table all now say "Re-Test Date"/"re-test" instead of "Expiry"/"exp").

## Re-Test Date manual entry removed (3 Sept 2026)

Direct request from Ravi: "As now we are using retest period at while
doing QC — Lets remove Expiry Date from QC screen and Related re-test
date from Purchase screen. Retest Date should be calculated by adding
retest period (days) into today's date as already being done in app.
Should not be manually selected." — see `docs/modules/qc.md`'s matching
entry for the QC-screen half of this change.

The "Now built" note directly above already established that this
module's own Re-Test Date field (`purchase_lines.expiry_date`, hand-typed
at receipt time) was never actually load-bearing for the retest
workflow — `quality_checks.retest_date`, computed automatically by
`trg_qc_compute_retest_date` from Retest period (days) + the review date
at QC approval time, was already the one real mechanism. This pass
retires the redundant manual field entirely rather than leaving it as
dead-but-required data entry:

- **Both purchase-line forms** (`purchase-line-form.tsx` —
  `PurchaseLineForm` and `EditPurchaseLineForm`) no longer render a
  Re-Test Date input at all, for either Raw Material or Packaging (it was
  already hidden for Packaging). The Unit Price/GST row that used to
  share a grid cell with it is now a plain 2-column row.
- **`lib/actions/purchase.ts`**: `expiry_date` removed from `lineSchema`/
  `updateLineSchema` entirely (not just made optional) and no longer read
  from `formData` or written on insert/update — `createPurchaseLine()`'s
  and `updatePurchaseLine()`'s "Re-Test date is required for raw
  material" checks are gone, along with the item-category lookups that
  only existed to support them (the category lookup added for the
  Packaging Item purchase path is still there where something else needs
  it; where it was purely for this check, it was removed too).
- **No migration** — `purchase_lines.expiry_date` stays in the schema
  (already nullable since `0024_purchase_lines_currency_retest.sql`) and
  every existing line keeps whatever value it has on file. New lines
  simply insert with it left `null`, same non-destructive pattern used
  for Item Master's removed sampling-defaults fields (Seventh pass).
- **Downstream displays left in place, not removed**: the "RE-TEST DATE"
  column on the Purchase Lines table, the Purchase Register report
  column, the Finished Product detail composition table column, and
  BMR's/FP-compose's batch-picker "(re-test …)" suffix all still read
  and display `purchase_lines.expiry_date` — they already handle `null`
  gracefully (`formatDate(null)` → "—"), so historical batches that do
  have a value keep showing it; new batches just show "—"/nothing.
  Nothing was deleted, only new collection stopped.
- **One real behavior fix required, not just a no-op**: Finished
  Product's compose-step FIFO candidate ordering
  (`finished-product/new/compose/page.tsx`) previously sorted candidates
  by `expiry_date` first, `created_at` as a tiebreaker — with
  `expiry_date` now `null` for every batch received going forward, and
  JS string-sort treating `null`-as-`""` as sorting *first*, this would
  have silently inverted FIFO into "the newest, undated batch always
  wins." Fixed by dropping `expiry_date` from the sort entirely and
  ordering by `created_at` alone (oldest received first) — which is also
  the more literally correct definition of FIFO (first *in*, not
  soonest-to-expire) regardless of this change. See
  `docs/modules/finished-product.md`'s matching entry.

Verification: `npx tsc --noEmit`, `npx eslint` on every touched file, and
`npx next build` (all 42 routes) all clean.

## RM Intimation slip (3 Sept 2026)

"Against each raw material purchased under purchase lines, create Raw
Material Intimation slip as per attached sample. At the end of the Raw
Material line there should be link labeled RM Intimation to download pdf"
(Ravi, with a sample PDF attached — a printed "please sample this batch"
request to QC, two identical copies on one A4 page).

- **New "RM Intimation" column** on the Purchase Lines table
  (`purchase-lines-table.tsx`), rendered for every line — a text link for
  raw material lines (`item.category === 'raw'`), "—" for packaging lines
  (packaging is never QC-sampled, so there's nothing to intimate).
  Clicking it downloads a PDF for that one line, generated entirely
  client-side (no Server Action, no new database round trip — every field
  it needs is already on the page).
- **`app/(dashboard)/purchase/[id]/rm-intimation-pdf.ts`** —
  `downloadRmIntimationPdf()`, a plain (not `"use client"`) module,
  deliberately structured this way per the lesson in
  `lib/packaging-materials.ts`'s equivalent comment: it's imported and
  called directly from `purchase-lines-table.tsx` (a client component), so
  it has no Server/Client boundary to cross. Draws the slip twice on one
  page (`drawSlip()` called at two different y-offsets) rather than
  reusing `lib/pdf.ts`'s `letterhead()`, which isn't parameterized for an
  offset and lays out quite differently from the sample (a "To, / QC
  Department, / Respected Sir/Madam," greeting, a `Sr.No`/`R.M.Name`/
  `R.M.Code`/`Qty Purchased`/`Vendor Name`/`Batch No`/`QC Qty`/`R&D Qty`
  table, and three signature lines — Production Chemist / Sampled By / QC
  Incharge — instead of `letterhead()`'s single masthead-plus-table
  shape). Still reuses `lib/pdf.ts`'s `COMPANY_NAME`/`MFG_LIC_NO`
  constants and the same brand green used everywhere else in the app's
  PDFs, for consistency. Quantities are shown to 3 decimal places
  (`qty3()`, e.g. "35.000 kg") to match the sample, rather than
  `formatNumber()`'s app-wide trimmed style ("35 kg") — a deliberate,
  narrow deviation scoped to this one document.
- **Field mapping**: `Bill No` / `Date` come from the parent purchase
  order's own `invoice_number`/`invoice_date` (already shown at the top of
  this page) — not a new per-line field. `R.M.Name`/`R.M.Code` from the
  line's linked item; `Qty Purchased` from `quantity` (the full received
  amount, not `remaining_qty`); `Vendor Name` from the PO's vendor;
  `Batch No`, `QC Qty`, `R&D Qty` straight from the line's own columns.
  `Sr.No` is always "1" — this is a one-line-per-PDF document, one slip
  per purchase line, not a whole-PO register.
- **No schema or Server Action change** — every field the slip needs was
  already being fetched and displayed on this page; `page.tsx` only gained
  three extra props threaded down to `PurchaseLinesSection` →
  `PurchaseLinesTable` (`poInvoiceNumber`, `poInvoiceDate`, `vendorName`).
- Filename: `RM-Intimation_<item code>_<batch number>.pdf`.

Verification: `npx tsc --noEmit`, `npx eslint` on every touched file, and
`npx next build` (all 42 routes) all clean.

## RM Intimation slip — exact visual match to the sample (3 Sept 2026)

"update this so RM Intimation slip has exact same look and feel as
attached. With Same Logo, design and color scheme" (Ravi, re-attaching the
same sample PDF). The first pass above matched the sample's fields and
two-copies-per-page structure but was still a generic, brand-green,
app-styled document — this pass makes it a close visual reproduction of
the actual legacy Crystal Reports export instead:

- **Real logo, extracted from the sample itself**: `pdfimages` pulled the
  embedded Atharva wordmark straight out of the attached PDF (a lossless
  extraction, not a redraw), re-encoded to a 16-colour PNG for a small
  file size with no visible quality loss, and stored as a base64 constant
  in the new `atharva-logo.ts` (kept separate from `rm-intimation-pdf.ts`
  so the large data string doesn't clutter the drawing logic). Placed
  top-left at its native 2:1 aspect ratio (`ATHARVA_LOGO_ASPECT`).
- **Verbatim company text, not the app-wide constants**: the sample reads
  "Atharva Nature Health Care Pvt. Ltd. Wagholi,Pune" / "Mfg. Lic.  No.-
  PD/AYU/111", which differs slightly in wording and punctuation from
  `lib/pdf.ts`'s `COMPANY_NAME`/`MFG_LIC_NO` ("Atharva Nature Healthcare
  Pvt. Ltd." / "PD/AYU-111", used by every other PDF in the app). This
  slip transcribes the sample's own text as local constants
  (`SLIP_COMPANY_NAME`/`SLIP_MFG_LIC`) instead — a deliberate, narrowly
  scoped exception to reproduce this one legacy document exactly, not a
  correction applied to the shared constants (which stay as they are for
  every other PDF).
- **Plain black-ruled table, no brand-green fill**: the sample itself is
  monochrome — black text and black grid lines on white, only the logo is
  in colour. The table's `autoTable` config switched from the app-wide
  green header fill (used by every other table export in this app) to a
  white header with bold black text and a full black grid
  (`theme: "grid"`, black `lineColor`), matching what's actually on the
  page in the sample rather than this app's usual PDF styling.
- **Layout offsets measured off the sample, not eyeballed**: the sample
  was rendered at 200dpi (`pdftoppm`) and each element's ink bounding box
  (logo, company name, license line, title, rule, table, signature block)
  was measured in pixels and converted to mm, so `drawSlip()`'s hand-tuned
  y-offsets land within a millimetre or two of the original Crystal
  Reports positions — including the second copy's start position (~155mm
  down the page), not just "roughly halfway."
- **Verified by actually rendering it**: generated a test PDF locally
  (`npx tsx`, jsPDF's Node build writes straight to disk) using the
  sample's own data (Jatamansi / R062 / 35 kg / Ambadas vanoushadhalay /
  RM 05/26 / 0.050 / 0.000, Bill No 1080, Date 15/07/2026) and rendered it
  side-by-side against the original with `pdftoppm` — not just a build
  check, an actual visual diff. Test script and output were scratch files,
  deleted before commit.
- No data/field changes from the prior pass — this is styling-only.

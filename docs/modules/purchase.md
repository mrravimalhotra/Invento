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

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

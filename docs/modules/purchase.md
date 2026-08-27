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

-- ============================================================
-- Inventory Ledger redesign, Phase 4 — Stock Position + per-item detail
-- page + Ledger running balance/filters.
--
-- Scoped via AskUserQuestion (claude/inventory-ledger-redesign.md, Part 3,
-- Option B+C+A folded together): all three categories (raw material,
-- packaging, finished product) get the full breakdown treatment, not just
-- raw material; the per-item drill-down page ships in this same phase, not
-- a later one; the Ledger tab's running-balance column and filters ship
-- in this same phase too.
--
-- This migration is additive reporting infrastructure — two new views
-- plus one new generated-identity column (added while testing the
-- running-balance view, see below; nothing that changes what gets
-- written otherwise). Both views are read through the exact same RLS
-- surface Stock Balance/RM Report already rely on (items_select/
-- ledger_select: "any signed-in user," not row-scoped) — same precedent
-- as the pre-existing stock_balance/purchase_batch_status views, so no
-- new policy is needed and no security_invoker option is set (matches
-- those two).
-- ============================================================

-- ------------------------------------------------------------
-- 1. item_position — the Stock Position breakdown, one row per item
--    (including items with zero ledger activity, via the left join),
--    generic across category: the page picks which of these 8 raw
--    numbers to show as columns per category (RM gets the full
--    purchase/QC/Stability/R&D/wastage/FP-consumption breakdown; FP gets
--    Yield/QC/Stability/R&D; Packaging gets Received/Issued). `on_hand`
--    is computed with the exact same case expression stock_balance
--    (0001_init.sql) already uses, so the two can never disagree —
--    verified during local testing that summing the breakdown columns
--    reconciles to `on_hand` for every item and every category, since
--    every reference_type in inventory_ledger's check constraint is
--    covered by exactly one bucket below (see the migration's commit
--    message for the reconciliation this was checked against).
--    reference_type = 'qc' (kept only for historical rows since Phase 1,
--    0028_ledger_sample_pull_fix.sql — nothing new writes it) is folded
--    into held_qc alongside 'qc_sample', since it's the same kind of
--    event under an old label.
-- ------------------------------------------------------------
create or replace view public.item_position as
select
  i.id as item_id,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'purchase' then l.quantity else 0 end), 0) as received,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'fp_yield' then l.quantity else 0 end), 0) as yielded,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type in ('qc', 'qc_sample') then l.quantity else 0 end), 0) as held_qc,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'stability_sample' then l.quantity else 0 end), 0) as held_stability,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'rnd_sample' then l.quantity else 0 end), 0) as held_rnd,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'finished_product' then l.quantity else 0 end), 0) as consumed_by_fp,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaging' then l.quantity else 0 end), 0) as issued_packaging,
  coalesce(sum(case when l.event_type = 'wastage' then l.quantity else 0 end), 0) as wastage,
  coalesce(sum(case l.event_type when 'push' then l.quantity when 'wastage' then -l.quantity else -l.quantity end), 0) as on_hand
from public.items i
left join public.inventory_ledger l on l.item_id = i.id
group by i.id;

-- ------------------------------------------------------------
-- 2. A real insertion-order column, found necessary while testing the
--    running-balance view below: several rows can share the exact same
--    event_at (every trigger that pushes-then-pulls within one
--    transaction — e.g. submit_purchase_order's push + 3 sample pulls,
--    or Phase 3's fp_yield push + 3 sample pulls — inserts them all at
--    the same `now()`). Tie-breaking the running-balance window function
--    on `id` (a random UUID) sorts these arbitrarily, which can put a
--    pull before its own push and show a momentarily negative balance
--    that never actually happened — confirmed locally: a same-transaction
--    RM purchase (push 100, pulls 5/3/2) showed running_balance dip to
--    -2 before recovering to 98, purely a display artifact of UUID
--    ordering. `generated always as identity` gives every row a real,
--    monotonically increasing sequence number in actual insert order —
--    existing rows get backfilled in whatever order Postgres's table
--    scan visits them (fine: bulk-imported legacy rows have no truer
--    "original insertion order" to recover, and don't share event_at
--    collisions with anything that matters), and every future insert
--    (including several in the same transaction) gets sequential values
--    in the order its own INSERT statement actually ran — which, for
--    every existing trigger, is push-before-its-pulls, matching reality.
-- ------------------------------------------------------------
alter table public.inventory_ledger add column if not exists seq bigint generated always as identity;

-- ------------------------------------------------------------
-- 3. inventory_ledger_with_balance — every inventory_ledger column plus
--    running_balance: that item's on-hand balance immediately after this
--    event, computed via a window function partitioned by item and
--    ordered by (event_at, seq) — chronological, with same-instant rows
--    broken by real insertion order rather than an arbitrary UUID (see
--    above). The Ledger page queries this view instead of the base
--    table; it can still be displayed newest-first (or filtered/paged
--    any way) without disturbing the balance, since the window
--    function's own ORDER BY is independent of the outer query's
--    display order.
-- ------------------------------------------------------------
create or replace view public.inventory_ledger_with_balance as
select
  il.*,
  sum(case il.event_type when 'push' then il.quantity when 'wastage' then -il.quantity else -il.quantity end)
    over (partition by il.item_id order by il.event_at, il.seq rows between unbounded preceding and current row) as running_balance
from public.inventory_ledger il;

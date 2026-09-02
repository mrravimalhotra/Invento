-- ============================================================
-- Finished Product — replace wt_total_rm/net_weight with a manually
-- entered Batch Yield (2 Sept 2026)
--
-- Per direct request: "Total Weight of RM used is incorrect and should
-- be removed from app and database... after each new batch is created,
-- Batch Yield needs to be entered manually basis on how much Finished
-- Product has been created. The unit will be same as of unit of
-- Finished product item." Confirmed destructive and explicitly OK'd —
-- this environment is test data, not live ("we are working on test
-- data so its ok to drop any data available. we are in testing phase
-- and not live").
--
-- This is the one migration this session that's genuinely destructive:
-- wt_total_rm held real values on 7 legacy-imported batches (30 kg,
-- 125 kg, 69.6 kg, etc.), and net_weight/actual_yield_pct were both
-- GENERATED columns computed from wt_total_rm and wastage — Postgres
-- can't drop a column that a generated column still depends on, so the
-- generated columns have to go first, then the column they depended on.
--
-- net_weight has no replacement — there's no longer a coherent "RM
-- weight in, minus wastage" concept once wt_total_rm is gone, and
-- nothing asked for one. actual_yield_pct IS kept, but redefined:
-- instead of (wt_total_rm - wastage) / wt_total_rm, it's now
-- batch_yield / target_qty — a much simpler, directly meaningful
-- number ("how much finished product actually came out, as a
-- percentage of what was targeted"). Every other reader of
-- actual_yield_pct (finished-product list, reports, this detail page)
-- needs no code change — same column name, same numeric type, just a
-- different (simpler, more honest) formula behind it.
--
-- net_qty was left alone by 0010 (removed from the Complete Batch form,
-- but not from the database, since dropping it wasn't asked for at the
-- time) — per a same-thread follow-up ("remove net_qty if unused"), it's
-- dropped here too. It was NOT actually unused, though: app/(dashboard)/
-- labels/page.tsx was still reading net_qty (falling back to total_units)
-- as the printed quantity on Finished Product labels — a real, working
-- consumer that patch 0010 silently broke going forward (any batch
-- completed after 0010 would print a blank/wrong label quantity, since
-- nothing filled net_qty/total_units anymore) without anyone noticing
-- until this migration's impact check caught it. Fixed in the same
-- change: labels/page.tsx now reads batch_yield instead, which is
-- exactly the "how much Finished Product came out of this batch" value
-- Labels actually needs. wastage and total_units are similarly unused
-- since 0010 but were NOT named in either request — left in place;
-- worth a follow-up if the same cleanup is wanted for those (checked:
-- neither has any other reader left in app/ or lib/).
-- ============================================================

alter table public.finished_product_batches drop column if exists net_weight;
alter table public.finished_product_batches drop column if exists actual_yield_pct;
alter table public.finished_product_batches drop column if exists wt_total_rm;
alter table public.finished_product_batches drop column if exists net_qty;

alter table public.finished_product_batches add column if not exists batch_yield numeric;

alter table public.finished_product_batches add column actual_yield_pct numeric generated always as (
  case when target_qty > 0 and batch_yield is not null
    then round(batch_yield / target_qty * 100, 2)
  end
) stored;

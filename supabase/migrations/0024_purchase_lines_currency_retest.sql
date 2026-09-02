-- ============================================================
-- Purchase lines: Re-Test Date optional for packaging (2 Sept 2026)
--
-- Per direct request, following on from Packaging Item purchases
-- (0023_packaging_purchase_batch_prefix.sql): "No need to show 'Expiry
-- Date' for Packaging Products. For Raw Material Rename Expiry Date to
-- Re-Test Date." The Purchase Add-line/Edit-line forms (purchase-
-- line-form.tsx) now only render this field for raw material lines, and
-- lib/actions/purchase.ts enforces it server-side as required for raw
-- material / not applicable for packaging by looking up the item's real
-- category — but the underlying column was `date not null`, which would
-- reject a packaging line's insert outright, so the constraint has to
-- move first.
--
-- Purely a loosened constraint (not null -> nullable) — additive/safe,
-- no data touched. Every existing row (all raw material to date) already
-- has a real date, so nothing here changes what's on file.
-- ============================================================

alter table public.purchase_lines alter column expiry_date drop not null;

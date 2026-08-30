-- ============================================================
-- Fix: "Could not generate item code: permission denied for sequence
-- item_code_seq_raw" (and the same error for every other auto-numbered
-- code in the app).
--
-- Root cause: 0001_init.sql's default-privilege grants cover tables
-- ("alter default privileges in schema public grant select, insert,
-- update, delete on tables to anon, authenticated") and functions
-- ("... grant execute on functions to anon, authenticated") but NOT
-- sequences — sequences were only granted to postgres/service_role. Every
-- get_next_*() function (get_next_item_code, get_next_vendor_code,
-- get_next_po_number, get_next_ar_number, get_next_mfr_code,
-- get_next_fp_batch_number, get_next_coa_number, get_next_feedback_ticket)
-- is a plain `language sql` function — not `security definer` — so it runs
-- as the CALLING role (authenticated, via the anon/authenticated Postgres
-- roles Supabase's RLS-enforced client uses), and that role never had
-- nextval() rights on any of these sequences. Any signed-in user hitting
-- "New Item" / "New Vendor" / "New Purchase Order" / etc. would hit this.
--
-- Standalone, additive migration — run this ON ITS OWN in the SQL Editor.
-- Purely a privilege grant; touches no data, no table structure. Safe to
-- re-run any number of times.
-- ============================================================

grant usage, select on all sequences in schema public to anon, authenticated;

-- Cover any sequence created after this migration runs too (mirrors the
-- default-privilege statements already in place for tables/functions).
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;

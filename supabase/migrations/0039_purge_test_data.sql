-- ============================================================
-- Admin "Purge Test Data" utility.
--
-- Ravi (13 Sept 2026): "Create an admin controlled button to Purge all
-- inventory/purchase related data except authentication and similar
-- records so i can do testing from scratch without any historical
-- records" — part of setting up repeatable end-to-end testing for the
-- Purchase/Equipment/Dead-Stock bulk upload feature. Scoped via
-- AskUserQuestion before writing this:
--   - Scope: EVERYTHING except auth-adjacent tables — including master
--     data (Item Master, Vendor Master, Item Type Master, MFR
--     definitions), not just transactional/ledger data. A true blank
--     slate: after purging, a fresh set of Item Master / Vendor Master
--     bulk uploads is what re-populates the app, exactly like a brand
--     new install.
--   - Legacy data: ALSO wiped. The ~92,000 LEG- prefixed rows from the
--     original migration are not preserved by this button (unlike the
--     one-off reset-test-data-2026-09-02.sql script, which deliberately
--     kept them) — Ravi explicitly chose this for a genuinely clean
--     testing baseline.
--   - What's kept: `profiles`, `user_roles` (authentication/access —
--     Ravi's own account and role assignments must survive so the app
--     stays usable immediately after a purge) and `page_feedback` (the
--     tracked tester-feedback ticket history this whole project's audit
--     trail is built from — Ravi confirmed directly: "do not remove
--     feedback/suggestion"). Nothing in `auth.*` (Supabase's own login
--     tables) is touched at all; this function only ever operates on
--     `public.*`.
--
-- Every other table in `public` (22 of them) is purged: bmr_observations,
-- bmr_records, bmr_weighment_lines, coa_records, dead_stock_items,
-- documents, environmental_control_readings, equipment,
-- finished_product_batches, finished_product_components,
-- inventory_ledger, item_types, items, line_clearance_checks,
-- mfr_definitions, mfr_lines, packaging_issue_items, packaging_issues,
-- purchase_lines, purchase_orders, quality_checks, vendors.
--
-- Every code-generating sequence used by those tables is also reset to
-- restart at 1, so the next item/vendor/PO/AR/MFR/equipment/dead-stock
-- code generated after a purge starts clean at *-0001 again — same
-- behavior Ravi confirmed he wanted from the 2 Sept test-data reset.
-- feedback_ticket_seq is deliberately NOT reset, since page_feedback
-- itself is kept and ticket numbers must stay unique/continuous.
--
-- TRUNCATE, not DELETE: this table set has real foreign-key chains
-- (purchase_lines -> purchase_orders, quality_checks -> purchase_lines/
-- finished_product_batches, etc.) — TRUNCATE ... CASCADE handles all of
-- that in one atomic statement regardless of dependency order, which a
-- hand-ordered sequence of DELETEs would be fragile against as the
-- schema evolves. CASCADE only reaches tables that reference the ones
-- listed here; `profiles`/`user_roles`/`page_feedback` only reference
-- `auth.users`, never any table in this purge list, so they are
-- structurally safe from being swept in by CASCADE — confirmed by
-- reading their migrations before writing this, not assumed.
-- ============================================================

create or replace function public.purge_test_data()
returns table(table_name text, rows_purged bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tables text[] := array[
    'bmr_observations', 'bmr_records', 'bmr_weighment_lines', 'coa_records',
    'dead_stock_items', 'documents', 'environmental_control_readings', 'equipment',
    'finished_product_batches', 'finished_product_components', 'inventory_ledger',
    'item_types', 'items', 'line_clearance_checks', 'mfr_definitions', 'mfr_lines',
    'packaging_issue_items', 'packaging_issues', 'purchase_lines', 'purchase_orders',
    'quality_checks', 'vendors'
  ];
  -- feedback_ticket_seq intentionally excluded — page_feedback is kept.
  v_sequences text[] := array[
    'item_code_seq_raw', 'item_code_seq_pkg', 'item_code_seq_fp', 'item_code_seq_pkgfp',
    'vendor_code_seq', 'po_number_seq', 'ar_number_seq', 'mfr_code_seq', 'fp_batch_seq',
    'coa_number_seq', 'equipment_code_seq', 'dead_stock_code_seq'
  ];
  v_tbl text;
  v_seq text;
  v_count bigint;
  v_truncate_list text;
begin
  -- Same role-check convention as every other SECURITY DEFINER write
  -- function in this app: RLS is bypassed by SECURITY DEFINER, so this
  -- explicit check is what's actually gating the call, not table policy.
  -- Admin-only, same as delete/reopen actions — this is far more
  -- destructive than any of those, so it gets at least that same bar.
  if not public.has_any_role('system_admin') then
    raise exception 'Only System Admin can purge test data.';
  end if;

  -- Snapshot row counts BEFORE truncating, since TRUNCATE itself reports
  -- nothing useful — this is what lets the app show a real summary of
  -- what was wiped ("items: 2,317 rows", "purchase_lines: 92,406 rows",
  -- ...) rather than a generic "done."
  foreach v_tbl in array v_tables loop
    execute format('select count(*) from public.%I', v_tbl) into v_count;
    table_name := v_tbl;
    rows_purged := v_count;
    return next;
  end loop;

  select string_agg(format('public.%I', t), ', ') into v_truncate_list from unnest(v_tables) as t;
  execute format('truncate table %s restart identity cascade', v_truncate_list);

  foreach v_seq in array v_sequences loop
    execute format('alter sequence public.%I restart with 1', v_seq);
  end loop;
end $$;

-- No explicit grant needed — see 0037's closing comment (default
-- privileges already cover functions created after 0001_init.sql).

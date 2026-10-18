-- ============================================================
-- Scan evidence — Phase 10 (cross-cutting integrity and concurrency)
-- Part 1 (P10.1): live read-only checks, safe on the live database.
-- Part 2: two-session reproductions, for a SCRATCH database only (they commit data).
-- ============================================================

-- Live read-only check 12 (SCAN-P10-01): lines on a submitted purchase order that never entered stock.
select po.po_number, pl.batch_number, pl.quantity, pl.unit, pl.created_at
from purchase_lines pl join purchase_orders po on po.id = pl.purchase_order_id
where po.status = 'submitted' and pl.active and pl.pushed_at is null and po.opening_load_id is null
order by pl.created_at;

-- Live read-only check 13 (SCAN-P10-02, also SCAN-P1-08): QC records that are rejected but still carry an expiry date or retest period
-- (left behind when an approval and a rejection were saved at nearly the same time, or a decision was changed later).
select ar_number, status, expiry_date, retest_period_days, reviewed_at
from quality_checks
where status = 'rejected' and (expiry_date is not null or retest_period_days is not null)
order by reviewed_at desc limit 100;

-- Live read-only check 14 (SCAN-P10-04, also SCAN-P2-03): active items and vendors whose names differ only by case or spacing.
select 'item' as kind, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) as normalized_name, count(*) as copies, string_agg(item_code, ', ' order by item_code) as codes
from items where active group by 2 having count(*) > 1
union all
select 'vendor', lower(regexp_replace(btrim(name), '\s+', ' ', 'g')), count(*), string_agg(vendor_code, ', ' order by vendor_code)
from vendors where active group by 2 having count(*) > 1
order by 1, 2;

-- ============================================================
-- Part 2 — reproductions (scratch database with the standard test users; run each file in two terminals as noted)
-- ============================================================

-- R1 (SCAN-P10-01). Terminal 1 starts first, terminal 2 starts about 1.5 seconds later.
--   Fixture (committed): a draft purchase order with one line.
--   Terminal 1 (Inventory Manager):  begin; select submit_purchase_order('<po id>'); select pg_sleep(4); commit;
--   Terminal 2 (Inventory Manager):  begin; insert into purchase_lines (purchase_order_id, item_id, batch_number, quantity, unit, qc_qty, stability_qty, rnd_qty, unit_price, gst_pct)
--                                      values ('<po id>', '<item id>', 'X-2', 50, 'kg', 1, 0, 0, 10, 5); commit;
--   Result: both commit. The order is "submitted"; line 1 is pushed (stock 99); line 2 has pushed_at = NULL, live_remaining 49, and no ledger rows.
--   Cause: the line guard trigger reads the order status without locking it (`select ... from purchase_orders where id = ...`), so it still sees "draft" while the submit is uncommitted.

-- R2 (SCAN-P10-02). A QC record in status checker_approved (Round 1 done by the Quality Checker).
--   Terminal 1 (QC Reviewer):   begin; update quality_checks set status='approved', retest_period_days=90, expiry_date=current_date+400, reviewed_by=<id>, reviewed_at=now() where id='<qc id>'; select pg_sleep(4); commit;
--   Terminal 2 (System Admin):  begin; update quality_checks set status='rejected', review_comments='not suitable', reviewed_by=<id>, reviewed_at=now() where id='<qc id>'; commit;
--   Result: both succeed; final status rejected, reviewer = the second person, expiry 2027-11-15 and retest 90 days left on the rejected record. The stock ledger ends consistent
--   (the rejection trigger moves the batch out; an approval after a rejection would move it back). The first person was told "approved".
--   Cause: the action reads the status, then updates by id only (no `status` condition); the stage trigger only guards changes starting from submitted / checker_approved (SCAN-P1-08).

-- R3 (sound). Two sessions each: begin; select check_sufficient_stock('<item id>', 60); insert a 60 kg pull; (first sleeps 4 s) commit;
--   Stock 108: the second session waits for the first, then is refused ("48 kg available, 60 kg needed"). On hand ends at 48.

-- R4 (SCAN-P10-04). insert into items (item_code, name, unit, category) values ('DUP-1','Same Name','kg','raw'), ('DUP-2','Same Name','kg','raw');  -> both rows saved.
--   insert into vendors (vendor_code, name) values ('V1','Same Vendor'), ('V2','same vendor'); -> both saved.


-- ============================================================
-- P10.2 evidence
-- ============================================================
-- Live read-only check 15 (SCAN-P10-07): the time zone the API role really gets. Expect Asia/Kolkata on every line.
select current_setting('TimeZone') as session_time_zone, now() as now_here, current_date as today_here;
select rolname, rolconfig from pg_roles where rolname in ('authenticator', 'authenticated', 'anon', 'postgres');
select datname, (select setconfig from pg_db_role_setting s where s.setdatabase = d.oid and s.setrole = 0) as db_setting
from pg_database d where datname = current_database();

-- Live read-only check 16 (SCAN-P10-05): the largest quantities, prices and texts stored today.
select 'purchase_lines.quantity' as what, max(quantity)::text as largest from purchase_lines
union all select 'purchase_lines.unit_price', max(unit_price)::text from purchase_lines
union all select 'finished_product_batches.batch_yield', max(batch_yield)::text from finished_product_batches
union all select 'items.name length', max(length(name))::text from items
union all select 'vendors.name length', max(length(name))::text from vendors
union all select 'quality_checks comments length', max(greatest(coalesce(length(checker_comments),0), coalesce(length(review_comments),0)))::text from quality_checks;

-- Live read-only check 17 (SCAN-P10-06): purchase orders whose total changes by a paisa depending on how it is rounded
-- (sum of unrounded lines versus sum of lines rounded to the paisa), as the screen and the downloads work it out.
select po.po_number,
       round(sum(pl.quantity * pl.unit_price * (1 + coalesce(pl.gst_pct,0)/100.0)), 2) as total_unrounded,
       sum(round(pl.quantity * pl.unit_price * (1 + coalesce(pl.gst_pct,0)/100.0), 2)) as total_of_rounded_lines
from purchase_orders po join purchase_lines pl on pl.purchase_order_id = po.id
where pl.unit_price is not null
group by po.po_number
having round(sum(pl.quantity * pl.unit_price * (1 + coalesce(pl.gst_pct,0)/100.0)), 2)
    <> sum(round(pl.quantity * pl.unit_price * (1 + coalesce(pl.gst_pct,0)/100.0), 2))
order by po.po_number limit 50;

-- R5 (SCAN-P10-05), scratch database: as Inventory Manager, on a draft order:
--   insert into purchase_lines (purchase_order_id, item_id, batch_number, quantity, unit, qc_qty, stability_qty, rnd_qty, unit_price, gst_pct)
--     values ('<po id>', '<item id>', 'BIGQ', 1e30, 'kg', 1, 0, 0, 1e20, 5);   -- ALLOWED
--   select submit_purchase_order('<po id>');   -- ok; stock_balance.on_hand for the item = 1e30
--   insert into vendors (vendor_code, name) values ('VBIG', repeat('x', 5000000));   -- ALLOWED (5,000,000 characters)

-- R6 (SCAN-P10-06), Node, the app's own formulas:
--   lines (1.5 x 33.33 @5 %), (2.5 x 33.33 @5 %), (0.75 x 12.35 @12 %) -> shown 52.49 + 87.49 + 10.37 = 150.35, order total shown 150.36
--   (0.001 * 45).toLocaleString('en-IN', {maximumFractionDigits: 2}) = "0.05" but (0.001 * 45).toFixed(2) = "0.04"


-- ============================================================
-- P10.3 evidence: test coverage (method, not a query)
-- ============================================================
-- 1. Copy scripts/dev/run-tests.sh. Remove the line that rebuilds fresh-install.sql (or keep it).
-- 2. After "alter database $DB set timezone ..." add:  -c "alter database $DB set track_functions to 'all'"
-- 3. Before the "p=$(echo "$out" | grep -c PASS)" line add:
--      $PSQL -d $DB -At -c "select funcname from pg_stat_user_functions where calls > 0" >> /tmp/covered_funcs.txt
-- 4. Run it, then compare `sort -u /tmp/covered_funcs.txt` with this list of the functions in the database:
--      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname !~ '^(pgp_|armor|crypt|decrypt|digest|encrypt|gen_|hmac|dearmor|t_ok)' order by 1;
-- Result on 11 Oct 2026 (108 migrations): 26 suites, 895 checks, all as expected; 97 of 119 functions called.
-- Not called (22): _is_direct_client_write, _trace_fp_node, _trace_issue_node, _trace_production_node, _trace_purchase_node, bulk_create_purchase_orders,
--   dashboard_qc_counts, get_next_coa_number, get_next_dead_stock_code, get_next_equipment_code, get_next_feedback_ticket, get_next_mfr_code, get_next_po_number,
--   get_next_production_rm_item_code, get_next_vendor_code, is_signed_in, peek_next_dead_stock_code, peek_next_equipment_code, peek_next_packaging_issue_code,
--   peek_next_vendor_code, trg_fn_audit_log_immutable, update_mfr_recipe.
--   Nineteen are one-line SQL functions the database inlines (a counter cannot see them); bulk_create_purchase_orders, update_mfr_recipe and
--   trg_fn_audit_log_immutable are real procedures.
-- The single expected failure in sec07 ("SQL editor: delete the last admin's account (cascade)") is the test stub's error text, not an application defect.

-- ============================================================================
-- live-data-checks.sql  --  READ-ONLY checks for the LIVE Supabase database
-- Written for the full-app scan of Invento (11 Oct 2026, step P10.4, then called scan-data-checks.sql)
-- and brought up to date for migration 0120 (finished product retest) on 18 Oct 2026.
-- Kept in the repository so the checks can be re-run after every release and before go-live.
--
-- HOW TO USE
--   1. Open the Supabase SQL Editor for the live project.
--   2. Paste ONE block at a time (a block = everything between two "-- ## " lines)
--      and press Run. Every statement is a SELECT: nothing is changed.
--   3. Blocks starting INV- are the invariant checks (Part 2): they return rows
--      ONLY when something is wrong. No rows = good.
--   4. All other blocks (Part 1) show what is stored today; the note on
--      each block says which finding it measures and what a healthy result looks like.
--   5. Paste anything unexpected back to Claude (text or screenshot).
--
-- ORDER
--   Part 1  P1-A .. P10-F   one family of checks per scan phase
--   Part 2  INV-S1..S10     stock invariants          (was scan-invariants-stock.sql, now part of this file)
--           INV-Q1..Q10     quality-control invariants (was scan-invariants-qc.sql)
--           INV-P1..P10     production invariants      (was scan-invariants-production.sql)
--           INV-K1..K11     packaging invariants       (was scan-invariants-packaging.sql)
--
-- Large result sets are limited to 50-200 rows. Run these off-hours if the
-- database is busy: none of them takes locks, but the INV- blocks read the whole ledger.
-- ============================================================================

-- ## P1-A  Which functions can an anonymous (not signed-in) caller run?
-- Expected after the fix for SCAN-P1-10: only has_any_role, has_role, has_app_access, is_signed_in (or nothing).
select p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and has_function_privilege('anon', p.oid, 'execute')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by 1;

-- ## P1-B  Which tables and views does the anonymous role hold privileges on?
-- Expected after the fix for SCAN-P1-12: no rows.
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by 1 order by 1;

-- ## P1-C  Do signed-in users hold write rights on views?  (should be none)
select c.relname as view_name,
       has_table_privilege('authenticated', c.oid, 'insert') as can_insert,
       has_table_privilege('authenticated', c.oid, 'update') as can_update,
       has_table_privilege('authenticated', c.oid, 'delete') as can_delete
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and (has_table_privilege('authenticated', c.oid, 'insert')
    or has_table_privilege('authenticated', c.oid, 'update')
    or has_table_privilege('authenticated', c.oid, 'delete'))
order by 1;

-- ## P1-D  Any extra schemas (for example the backup copy made before the 13 Sept purge)?
select n.nspname as schema_name,
       (select count(*) from pg_class c where c.relnamespace = n.oid and c.relkind = 'r') as tables
from pg_namespace n
where n.nspname not in ('pg_catalog','information_schema','pg_toast','public','auth','storage','extensions',
                        'graphql','graphql_public','realtime','vault','pgsodium','pgsodium_masks','supabase_functions',
                        'supabase_migrations','net','cron','pgbouncer','_realtime','_analytics','pg_temp','pg_toast_temp_1')
order by 1;

-- ## P1-E  Public tables with row-level security switched off  (expected: none)
select c.relname as table_name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- ## P1-F  QC records in a suspicious state (SCAN-P1-07, 08, 09)
-- Rows returned are not necessarily wrong: opening-stock loads and retests are legitimate.
-- Look at who created them and when.
select q.ar_number, q.status, q.is_legacy, q.is_retest,
       q.checker_by, q.reviewed_by, q.created_by, q.created_at, q.updated_at,
       case
         when q.status in ('approved','rejected') and q.reviewed_by is null then 'decided with no reviewer'
         when q.status = 'approved' and q.checker_by is null and not q.is_legacy then 'approved with no Round 1 checker'
         when q.checker_by is not null and q.reviewed_by = q.checker_by then 'same person did both rounds'
         when q.created_by <> coalesce(q.reviewed_by, q.created_by) and q.status = 'approved' and q.checker_by is null then 'approved by someone other than creator, no checker'
         else 'other'
       end as why
from quality_checks q
where (q.status in ('approved','rejected') and q.reviewed_by is null)
   or (q.status = 'approved' and q.checker_by is null and not q.is_legacy)
   or (q.checker_by is not null and q.reviewed_by = q.checker_by)
order by q.created_at desc;

-- ## P1-G  QC records that were INSERTED already decided, from the audit log (SCAN-P1-07)
select a.changed_at, a.changed_by, a.new_data ->> 'ar_number' as ar_number, a.new_data ->> 'status' as status
from audit_log a
where a.table_name = 'quality_checks' and a.action = 'insert'
  and coalesce(a.new_data ->> 'status', '') not in ('submitted')
order by a.changed_at desc
limit 200;

-- ## P1-H  QC records changed AFTER being decided, from the audit log (SCAN-P1-08)
select a.changed_at, a.changed_by, a.new_data ->> 'ar_number' as ar_number,
       a.old_data ->> 'status' as old_status, a.new_data ->> 'status' as new_status
from audit_log a
where a.table_name = 'quality_checks' and a.action = 'update'
  and a.old_data ->> 'status' in ('approved','rejected')
  and (a.old_data ->> 'status' is distinct from a.new_data ->> 'status'
       or a.old_data ->> 'ar_number' is distinct from a.new_data ->> 'ar_number'
       or a.old_data ->> 'reviewed_by' is distinct from a.new_data ->> 'reviewed_by'
       or a.old_data ->> 'sample_qty' is distinct from a.new_data ->> 'sample_qty')
order by a.changed_at desc
limit 200;

-- ## P2-A  Items whose category does not match the prefix of their code (SCAN-P2-01: category switched after creation)
select item_code, name, category, active, created_at
from items
where (category = 'raw' and item_code not like 'RM-%' and item_code not like 'LEG-%')
   or (category = 'packaging' and item_code not like 'PKG-%' and item_code not like 'LEG-%')
   or (category = 'processed' and item_code not like 'FP-%' and item_code not like 'LEG-%')
order by item_code;

-- ## P2-B  Category switches recorded in the audit log (SCAN-P2-01)
select a.changed_at, a.changed_by, a.new_data ->> 'item_code' as item_code,
       a.old_data ->> 'category' as old_category, a.new_data ->> 'category' as new_category
from audit_log a
where a.table_name = 'items' and a.action = 'update'
  and a.old_data ->> 'category' is distinct from a.new_data ->> 'category'
order by a.changed_at desc
limit 200;

-- ## P2-C  Raw materials with no item type; inactive items that still hold stock (SCAN-P2-02)
select 'raw without item type' as issue, i.item_code, i.name, null::numeric as on_hand
from items i where i.category = 'raw' and i.item_type_id is null and i.item_code not like 'LEG-%'
union all
select 'inactive but has stock', i.item_code, i.name, sum(l.quantity)
from items i join inventory_ledger l on l.item_id = i.id
where i.active = false
group by i.item_code, i.name having sum(l.quantity) > 0
order by 1, 2;

-- ## P2-D  Near-duplicate item names and item types (SCAN-P2-03): same text after lower-casing and squeezing spaces/punctuation
select 'item' as kind, lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g')) as key, string_agg(item_code || ' ' || name, ' | ') as rows
from items group by 2 having count(*) > 1
union all
select 'item type', lower(regexp_replace(description, '[^a-zA-Z0-9]+', '', 'g')), string_agg(description, ' | ')
from item_types group by 2 having count(*) > 1;

-- ## P2-E  Vendors: near-duplicates, no contact at all, inactive count (SCAN-P2-03, SCAN-P2-05)
select 'near-duplicate name' as issue, lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g')) as key,
       string_agg(vendor_code || ' ' || name, ' | ') as detail
from vendors group by 2 having count(*) > 1
union all
select 'no phone, mobile or email', vendor_code, name
from vendors where coalesce(mobile,'') = '' and coalesce(phone,'') = '' and coalesce(email,'') = ''
union all
select 'phone/mobile contains letters', vendor_code, coalesce(mobile,'') || ' / ' || coalesce(phone,'')
from vendors where mobile ~ '[A-Za-z]' or phone ~ '[A-Za-z]'
union all
select 'vendors marked inactive (should be 0 today: the screen cannot set it)', count(*)::text, ''
from vendors where active = false having count(*) > 0
order by 1, 2;

-- ## P2-F  Purchase lines saved with no unit price or no GST % (SCAN-P2-07)
select po.po_number, po.status, v.name as vendor, i.item_code, pl.batch_number, pl.unit_price, pl.gst_pct, po.created_at
from purchase_lines pl
join purchase_orders po on po.id = pl.purchase_order_id
join vendors v on v.id = po.vendor_id
join items i on i.id = pl.item_id
where (pl.unit_price is null or pl.gst_pct is null) and po.opening_load_id is null
order by po.created_at desc
limit 300;

-- ## P2-G  How many of them, by purchase order status (SCAN-P2-07)
select po.status, count(*) as lines_without_price_or_gst
from purchase_lines pl join purchase_orders po on po.id = pl.purchase_order_id
where (pl.unit_price is null or pl.gst_pct is null) and po.opening_load_id is null
group by po.status order by 1;

-- ## P2-H  GST % outside 0 to 100 and unusually high unit prices (SCAN-P2-09)
select po.po_number, i.item_code, pl.unit_price, pl.gst_pct
from purchase_lines pl join purchase_orders po on po.id = pl.purchase_order_id join items i on i.id = pl.item_id
where pl.gst_pct > 100 or pl.unit_price > 1000000
order by pl.gst_pct desc nulls last
limit 100;

-- ## P2-I  MFR names that differ only by capitals or spacing (SCAN-P2-09)
select lower(regexp_replace(name, '[^a-zA-Z0-9]+', '', 'g')) as key, string_agg(code || ' ' || name, ' | ') as mfrs
from mfr_definitions group by 1 having count(*) > 1;

-- ## P2-J  MFR batch size units that are not one of the app's units (SCAN-P2-09)
select code, name, batch_size_unit from mfr_definitions
where batch_size_unit not in ('kg','g','mg','ltr','ml','nos','bottle','pack');

-- ## P2-K  Opening stock loads: who loaded each, how many rows, what status mix (SCAN-P2-10, SCAN-P2-11)
select l.load_no, l.kind, l.row_count, l.summary, l.created_at, u.email as loaded_by
from opening_loads l left join auth.users u on u.id = l.created_by
order by l.created_at;

-- ## P2-L  Opening stock quantities that look like a unit mix-up: per item, very large lots compared with the item's other lots (SCAN-P2-10)
select i.item_code, i.name, i.unit, pl.batch_number, pl.quantity
from purchase_lines pl join items i on i.id = pl.item_id
where pl.is_legacy and pl.purchase_order_id in (select id from purchase_orders where opening_load_id is not null)
  and pl.quantity >= 1000
order by pl.quantity desc
limit 100;

-- ## P2-M  Display names that are duplicated or very long (SCAN-P2-12)
select lower(trim(full_name)) as name_key, count(*) as accounts, string_agg(id::text, ', ') as user_ids
from profiles where full_name is not null group by 1 having count(*) > 1
union all
select 'longer than 100 characters', count(*), string_agg(id::text, ', ') from profiles where length(full_name) > 100 having count(*) > 0;

-- ## P2-N  Display-name changes recorded in the audit log: who renamed whom, and when (SCAN-P2-12)
select a.changed_at, a.row_id as profile_id, a.old_data ->> 'full_name' as old_name, a.new_data ->> 'full_name' as new_name
from audit_log a
where a.table_name = 'profiles' and a.action = 'update'
  and a.old_data ->> 'full_name' is distinct from a.new_data ->> 'full_name'
order by a.changed_at desc
limit 200;

-- ## P3-A  Purchase lines whose QC record is for a different item, or whose batch was edited after approval (SCAN-P3-01)
select pl.batch_number, i.item_code as line_item, qi.item_code as qc_item, q.ar_number, q.status, q.sample_qty, pl.quantity
from quality_checks q
join purchase_lines pl on pl.id = q.purchase_line_id
join items i on i.id = pl.item_id
join items qi on qi.id = q.item_id
where q.item_id <> pl.item_id
order by q.created_at desc;

-- ## P3-B  Purchase orders that were reopened after a QC record existed on one of their lines (SCAN-P3-01)
select po.po_number, po.reopened_at, po.status, pl.batch_number, q.ar_number, q.status as qc_status
from purchase_orders po
join purchase_lines pl on pl.purchase_order_id = po.id
join quality_checks q on q.purchase_line_id = pl.id
where po.reopened_at is not null
order by po.reopened_at desc;

-- ## P3-C  Audit trail of edits to purchase lines that have a QC record: quantity, batch number or item changed (SCAN-P3-01)
select a.changed_at, a.changed_by, a.new_data ->> 'batch_number' as batch,
       a.old_data ->> 'quantity' as old_qty, a.new_data ->> 'quantity' as new_qty,
       a.old_data ->> 'batch_number' as old_batch, a.new_data ->> 'batch_number' as new_batch,
       a.old_data ->> 'item_id' as old_item, a.new_data ->> 'item_id' as new_item
from audit_log a
where a.table_name = 'purchase_lines' and a.action = 'update'
  and exists (select 1 from quality_checks q where q.purchase_line_id = a.row_id)
  and (a.old_data ->> 'quantity' is distinct from a.new_data ->> 'quantity'
    or a.old_data ->> 'batch_number' is distinct from a.new_data ->> 'batch_number'
    or a.old_data ->> 'item_id' is distinct from a.new_data ->> 'item_id')
order by a.changed_at desc
limit 200;

-- ## P3-D  Submitted purchase orders with no lines; submitted lines never pushed to stock (SCAN-P3-03)
select 'submitted order with no lines' as issue, po.po_number as ref, null::text as detail
from purchase_orders po
where po.status = 'submitted' and po.opening_load_id is null and not exists (select 1 from purchase_lines pl where pl.purchase_order_id = po.id)
union all
select 'line on submitted order never pushed', pl.batch_number, po.po_number
from purchase_lines pl join purchase_orders po on po.id = pl.purchase_order_id
where po.status = 'submitted' and pl.pushed_at is null;

-- ## P3-E  Stock invariants on live data: run the INV-S blocks further down this file (INV-S1 to INV-S10); any rows returned are findings (SCAN-P3-05)

-- ## P3-F  Batches received on a purchase order that was submitted much later than the line was typed (affects first-in-first-out order) (SCAN-P3-04)
select i.item_code, pl.batch_number, pl.created_at as line_typed_at, pl.pushed_at as received_into_stock_at,
       pl.pushed_at::date - pl.created_at::date as days_between
from purchase_lines pl join items i on i.id = pl.item_id
where pl.pushed_at is not null and not pl.is_legacy and pl.pushed_at - pl.created_at > interval '3 days'
order by days_between desc
limit 100;

-- ## P3-G  (read-only) P3-07: finished product batches past expiry still counted on hand, and wastage rows with blank reason
select 'fp_past_expiry' as check_name, count(*) as n
from finished_product_batches
where expiry_date is not null and expiry_date < current_date;
select 'wastage_blank_reason' as check_name, count(*) as n
from inventory_ledger
where event_type = 'wastage' and coalesce(btrim(reason),'') = '';

-- ## P3-H  (read-only) P3-10 / P3-11 / P3-12: stock the low-stock banner counts that production cannot use; priceless batches in the RM Report; opening loads
select 'raw items where on hand > usable' as check_name, count(*) as n
from stock_balance sb join item_stock_status s on s.item_id = sb.item_id
where sb.on_hand > s.usable;
select 'active raw items shown as not low but usable is below threshold' as check_name, count(*) as n
from items i join stock_balance sb on sb.item_id = i.id join item_stock_status s on s.item_id = i.id
where i.active and i.low_stock_threshold is not null and sb.on_hand >= i.low_stock_threshold and s.usable < i.low_stock_threshold;
select 'submitted raw batches with stock and no price' as check_name, count(*) as n
from purchase_lines pl join purchase_orders po on po.id = pl.purchase_order_id and po.status = 'submitted'
join items i on i.id = pl.item_id and i.category = 'raw'
where pl.active and pl.live_remaining_qty > 0 and pl.unit_price is null;
select 'opening load' as check_name, load_no, created_at from opening_loads order by created_at;

-- ## P7-A  How big is the Reports page today?  (SCAN-P7-02: the page reads whole tables)
select 'purchase_lines (active, submitted)' as what, count(*) from purchase_lines where active and pushed_at is not null
union all select 'purchase_lines legacy among them', count(*) from purchase_lines where active and pushed_at is not null and is_legacy
union all select 'quality_checks', count(*) from quality_checks
union all select 'finished_product_batches', count(*) from finished_product_batches
union all select 'items (raw, active)', count(*) from items where category='raw' and active
union all select 'stock_balance rows', count(*) from stock_balance;

-- ## P7-B  Lines whose draft date and submission date fall in different months (SCAN-P7-03)
select count(*) as lines_where_received_month_differs
from purchase_lines where active and pushed_at is not null
  and date_trunc('month', created_at at time zone 'Asia/Kolkata') <> date_trunc('month', pushed_at at time zone 'Asia/Kolkata');

-- ## P7-C  QC rows on Production raw material; these show "-" in the QC Register batch column (SCAN-P7-01)
select count(*) as production_rm_qc_rows from quality_checks where production_batch_id is not null;

-- ## P7-D  What the Dashboard "Inventory movement" chart adds up, last 30 days, by unit (SCAN-P7-09: the chart sums every unit together)
select unit, event_type, coalesce(reference_type,'-') as reason, count(*) as rows, sum(quantity) as total
from inventory_ledger where event_at >= now() - interval '30 days'
group by 1,2,3 order by 1,2,3;

-- ## P7-E  Approved raw material batches with stock left whose retest or expiry date has already passed (SCAN-P7-08: not shown on the Dashboard)
select count(*) filter (where expiry_date < current_date) as expired_with_stock,
       count(*) filter (where retest_date < current_date) as retest_overdue_with_stock
from batch_ageing where kind in ('raw','production_raw');

-- ## P7-F  Names that contain a character the PDF font cannot print (SCAN-P7-14). Any count above 0 prints garbled in table PDFs, COA and intimation slips.
select 'items.name' as field, count(*) from items where name ~ '[^\x01-\xff]'
union all select 'vendors.name', count(*) from vendors where name ~ '[^\x01-\xff]'
union all select 'mfr_definitions.name', count(*) from mfr_definitions where name ~ '[^\x01-\xff]'
union all select 'items.botanical_alias', count(*) from items where coalesce(botanical_alias,'') ~ '[^\x01-\xff]';

-- ## P8-A  Equipment marked Calibrated whose next due date has passed (SCAN-P8-01)
select equipment_code, name, calibration_status, last_calibration_date, next_calibration_due
from equipment where active and calibration_status = 'calibrated' and next_calibration_due < current_date
order by next_calibration_due limit 100;

-- ## P8-B  Equipment with a due date but no status, a status with no dates, or a due date before the last calibration (SCAN-P8-01)
select count(*) filter (where calibration_status is null and next_calibration_due is not null) as date_but_no_status,
       count(*) filter (where calibration_status in ('calibrated','due') and last_calibration_date is null and next_calibration_due is null) as status_but_no_dates,
       count(*) filter (where next_calibration_due < last_calibration_date) as due_before_last
from equipment where active;

-- ## P8-C  Dead stock rows whose figures do not agree with each other (SCAN-P8-02)
select asset_code, article_name, quantity, rejected_qty, balance_qty, depreciated_unit_value, balance_value
from dead_stock_items
where active and (
      rejected_qty > quantity
   or (balance_qty is not null and balance_qty <> quantity - rejected_qty)
   or (balance_qty is not null and balance_value is not null and abs(balance_value - balance_qty * depreciated_unit_value) > 1)
   or (balance_qty is null and balance_value is not null))
order by asset_code limit 200;

-- ## P8-D  Deactivated equipment and dead stock records that no list shows (SCAN-P8-03)
select (select count(*) from equipment where not active) as inactive_equipment,
       (select count(*) from dead_stock_items where not active) as inactive_dead_stock;

-- ## P8-E  Documents on the list at more than one active revision of the same title (SCAN-P8-06)
select doc_type, title, count(*) as active_revisions, max(revision_number) as highest
from documents where active group by doc_type, title having count(*) > 1 order by title;

-- ## P8-F  Odd values already stored in documents, environmental readings and line clearance (SCAN-P8-04, 05, 06, 07)
select (select count(*) from documents where revision_number < 0 or file_url !~* '^https?://') as odd_documents,
       (select count(*) from environmental_control_readings where temperature is null and humidity is null) as empty_readings,
       (select count(*) from environmental_control_readings where humidity not between 0 and 100 or temperature not between -40 and 80) as implausible_readings,
       (select count(*) from line_clearance_checks where status = 'not_clear') as not_clear_checks,
       (select count(*) from line_clearance_checks lc where batch_reference is not null
          and not exists (select 1 from finished_product_batches b where b.batch_number = lc.batch_reference)
          and not exists (select 1 from production_issue_batches p where p.batch_number = lc.batch_reference)) as batch_ref_matches_nothing;

-- ## P8-G  Feedback tickets with a category or reply filled while the status is still 'new' (SCAN-P8-10)
select ticket_number, submitted_by_name, category, left(claude_notes, 60) as reply
from page_feedback where status = 'new' and (category is not null or claude_notes is not null) order by ticket_number;

-- ## P8-H  The five longest feedback ticket texts (SCAN-P8-10)
select ticket_number, length(observation) as chars from page_feedback order by length(observation) desc limit 5;

-- ## P8-I  Deprecated BMR records: how many, how many approved, how many prepared, checked and approved by the same person (SCAN-P8-14)
select count(*) as bmr_records,
       count(*) filter (where approved_at is not null) as approved,
       count(*) filter (where prepared_by = checked_by and checked_by = approved_by) as same_person_all_three
from bmr_records;

-- ## P9-A  Every table in the app. Compare with SCAN-P9-01, 04, 05, 08: none holds deviations, OOS, change control, CAPA, complaints, training, stock counts, returns or sample disposal.
select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;

-- ## P9-B  What a vendor and a receipt line can hold today (SCAN-P9-02)
select table_name, string_agg(column_name, ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public' and table_name in ('vendors', 'purchase_orders', 'purchase_lines')
group by table_name order by table_name;

-- ## P9-C  What a finished-product batch and a QC record can hold today (SCAN-P9-03)
select table_name, string_agg(column_name, ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public' and table_name in ('finished_product_batches', 'quality_checks')
group by table_name order by table_name;

-- ## P9-D  How much of the vendor master is filled in: vendors used on purchases, and vendors with no phone, mobile or e-mail (SCAN-P9-02)
select (select count(*) from vendors where active) as active_vendors,
       (select count(distinct vendor_id) from purchase_orders) as vendors_with_purchases,
       (select count(*) from vendors where active and coalesce(nullif(trim(mobile), ''), nullif(trim(phone), ''), nullif(trim(email), '')) is null) as no_contact_at_all;

-- ## P9-E  Rejected raw-material batches still in stock with nothing recorded about what happened to them (SCAN-P9-04)
select count(*) as rejected_batches_with_stock from rejected_batches;

-- ## P10-A  Lines on a submitted purchase order that never entered stock (SCAN-P10-01)
select po.po_number, pl.batch_number, pl.quantity, pl.unit, pl.created_at
from purchase_lines pl join purchase_orders po on po.id = pl.purchase_order_id
where po.status = 'submitted' and pl.active and pl.pushed_at is null and po.opening_load_id is null
order by pl.created_at;

-- ## P10-B  QC records that are rejected but still carry an expiry date or retest period (SCAN-P10-02, SCAN-P1-08)
select ar_number, status, expiry_date, retest_period_days, reviewed_at
from quality_checks
where status = 'rejected' and (expiry_date is not null or retest_period_days is not null)
order by reviewed_at desc limit 100;

-- ## P10-C  Active items and vendors whose names differ only by capitals or spacing (SCAN-P10-04, SCAN-P2-03)
select 'item' as kind, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) as normalized_name, count(*) as copies, string_agg(item_code, ', ' order by item_code) as codes
from items where active group by 2 having count(*) > 1
union all
select 'vendor', lower(regexp_replace(btrim(name), '\s+', ' ', 'g')), count(*), string_agg(vendor_code, ', ' order by vendor_code)
from vendors where active group by 2 having count(*) > 1
order by 1, 2;

-- ## P10-D  The time zone the app's database connection really gets. Expect Asia/Kolkata on every line (SCAN-P10-07)
select current_setting('TimeZone') as session_time_zone, now() as now_here, current_date as today_here;
select rolname, rolconfig from pg_roles where rolname in ('authenticator', 'authenticated', 'anon', 'postgres');
select datname, (select setconfig from pg_db_role_setting s where s.setdatabase = d.oid and s.setrole = 0) as db_setting
from pg_database d where datname = current_database();

-- ## P10-E  The largest quantities, prices and texts stored today (SCAN-P10-05: nothing caps them)
select 'purchase_lines.quantity' as what, max(quantity)::text as largest from purchase_lines
union all select 'purchase_lines.unit_price', max(unit_price)::text from purchase_lines
union all select 'finished_product_batches.batch_yield', max(batch_yield)::text from finished_product_batches
union all select 'items.name length', max(length(name))::text from items
union all select 'vendors.name length', max(length(name))::text from vendors
union all select 'quality_checks comments length', max(greatest(coalesce(length(checker_comments),0), coalesce(length(review_comments),0)))::text from quality_checks;

-- ## P10-F  Purchase orders whose total changes by a paisa depending on how it is rounded (SCAN-P10-06)
select po.po_number,
       round(sum(pl.quantity * pl.unit_price * (1 + coalesce(pl.gst_pct,0)/100.0)), 2) as total_unrounded,
       sum(round(pl.quantity * pl.unit_price * (1 + coalesce(pl.gst_pct,0)/100.0), 2)) as total_of_rounded_lines
from purchase_orders po join purchase_lines pl on pl.purchase_order_id = po.id
where pl.unit_price is not null
group by po.po_number
having round(sum(pl.quantity * pl.unit_price * (1 + coalesce(pl.gst_pct,0)/100.0)), 2)
    <> sum(round(pl.quantity * pl.unit_price * (1 + coalesce(pl.gst_pct,0)/100.0), 2))
order by po.po_number limit 50;


-- ## INV-S1  Item on-hand equals the sum of its parts in item_position (any ledger row type not classified shows up here)
select i.item_code, p.on_hand,
       p.received + p.yielded - p.held_qc - p.held_stability - p.held_rnd - p.consumed_by_fp - p.issued_packaging
       - p.wastage - p.consumed_by_packaging + p.packaged_yield - p.issued_store - p.issued_rnd + p.production_rm_yield - p.rejected as parts_total
from item_position p join items i on i.id = p.item_id
where p.on_hand is distinct from
      p.received + p.yielded - p.held_qc - p.held_stability - p.held_rnd - p.consumed_by_fp - p.issued_packaging
      - p.wastage - p.consumed_by_packaging + p.packaged_yield - p.issued_store - p.issued_rnd + p.production_rm_yield - p.rejected;

-- ## INV-S2  Batch remaining quantity (purchase_lines.live_remaining_qty) equals what the ledger says for that batch (submitted lines only).
-- The move of a rejected batch to Rejected Materials (reference qc_rejected) is left out: the material is still physically there.
with led as (
  select purchase_line_id, sum(case event_type when 'push' then quantity else -quantity end) as net
  from inventory_ledger where purchase_line_id is not null and reference_type is distinct from 'qc_rejected' group by 1)
select i.item_code, pl.batch_number, pl.live_remaining_qty, coalesce(l.net, 0) as ledger_net, pl.live_remaining_qty - coalesce(l.net, 0) as difference
from purchase_lines pl join items i on i.id = pl.item_id left join led l on l.purchase_line_id = pl.id
where pl.pushed_at is not null and pl.live_remaining_qty is distinct from coalesce(l.net, 0)
order by 1, 2;

-- ## INV-S3  Production-issued raw material batches: remaining equals the batch quantity less what the ledger shows used from it
with led as (
  select production_batch_id, sum(case event_type when 'push' then quantity else -quantity end) as net
  from inventory_ledger where production_batch_id is not null group by 1)
select i.item_code, pb.id as production_batch_id, pb.quantity, pb.live_remaining_qty, coalesce(l.net, 0) as ledger_net
from production_issue_batches pb join items i on i.id = pb.item_id left join led l on l.production_batch_id = pb.id
where pb.active and pb.live_remaining_qty is distinct from pb.quantity + coalesce(l.net, 0);

-- ## INV-S4  Negative stock: any item or batch below zero
select 'item on hand below zero' as issue, i.item_code as ref, b.on_hand::text as value from stock_balance b join items i on i.id = b.item_id where b.on_hand < 0
union all
select 'batch remaining below zero', pl.batch_number, pl.live_remaining_qty::text from purchase_lines pl where pl.live_remaining_qty < 0
union all
select 'production batch remaining below zero', pb.id::text, pb.live_remaining_qty::text from production_issue_batches pb where pb.live_remaining_qty < 0;

-- ## INV-S5  Lines that are not submitted (or were reopened) but still carry a net purchase quantity in the ledger
select pl.batch_number, po.po_number, po.status, sum(case l.event_type when 'push' then l.quantity else -l.quantity end) as purchase_net
from purchase_lines pl join purchase_orders po on po.id = pl.purchase_order_id
join inventory_ledger l on l.purchase_line_id = pl.id and l.reference_type = 'purchase' and l.reference_id = pl.id
where pl.pushed_at is null
group by pl.batch_number, po.po_number, po.status
having sum(case l.event_type when 'push' then l.quantity else -l.quantity end) <> 0;

-- ## INV-S6  Ledger rows whose unit differs from the item's unit, or whose item differs from the batch's item
select l.id, i.item_code, l.unit as ledger_unit, i.unit as item_unit, l.event_type, l.reference_type, l.quantity
from inventory_ledger l join items i on i.id = l.item_id
where l.unit is distinct from i.unit
union all
select l.id, i.item_code, null, null, l.event_type, 'item differs from batch item', l.quantity
from inventory_ledger l join purchase_lines pl on pl.id = l.purchase_line_id join items i on i.id = l.item_id
where pl.item_id <> l.item_id;

-- ## INV-S7  Write-offs (wastage) recorded with no reason text
select l.event_at, i.item_code, pl.batch_number, l.quantity, l.unit, l.event_by
from inventory_ledger l join items i on i.id = l.item_id left join purchase_lines pl on pl.id = l.purchase_line_id
where l.event_type = 'wastage' and coalesce(btrim(l.reason), '') = ''
order by l.event_at desc;


-- ## INV-S8  Finished product: ledger On hand vs sum of batch bulk remaining (the figure Ageing should use)
-- Expect no rows. A row means the ledger and the finished product batch figures have drifted apart for that item.
-- Corrected in scan P6.3: bulk used is the finished product quantity on the packaging issues (fp_qty_consumed, all
-- departments), not packaged_qty, which counts packs; and only approved batches are counted because the ledger
-- receives a batch's yield only when QC approves it. Since 0120 the bulk taken for retest samples is also
-- subtracted (retest_sample_qty). A batch whose retest was rejected has its bulk taken out of On hand; if that
-- batch still has status approved it will show here until it is looked at (information, not a fault).
with b as (
  select md.finished_product_item_id as item_id,
         sum(greatest(coalesce(fpb.batch_yield,0) - coalesce(fpb.qc_sample_qty,0) - coalesce(fpb.stability_qty,0)
                      - coalesce(fpb.rnd_qty,0) - coalesce(fpb.retest_sample_qty,0) - coalesce(iss.bulk,0), 0)) as bulk
    from public.finished_product_batches fpb
    join public.mfr_definitions md on md.id = fpb.mfr_definition_id
    left join lateral (select sum(pi.fp_qty_consumed) as bulk from public.packaging_issues pi
                        where pi.finished_product_batch_id = fpb.id) iss on true
   where fpb.active and fpb.status = 'approved'
   group by 1)
select i.item_code, round(coalesce(sb.on_hand,0),3) as ledger_on_hand, round(b.bulk,3) as batch_bulk
  from b join public.items i on i.id = b.item_id
  left join public.stock_balance sb on sb.item_id = i.id
 where abs(coalesce(sb.on_hand,0) - b.bulk) > 0.0005;

-- ## INV-S9  Duplicate batch numbers for the same item (purchase lines) and duplicate finished product batch numbers
-- Expect no rows.
select 'purchase batch' as kind, pl.item_id, pl.batch_number, count(*) as n
  from public.purchase_lines pl where pl.active group by pl.item_id, pl.batch_number having count(*) > 1
union all
select 'finished product batch', null, fpb.batch_number, count(*)
  from public.finished_product_batches fpb where fpb.active group by fpb.batch_number having count(*) > 1;

-- ## INV-S10  Orphans: submitted lines with no receipt push in the ledger, ledger pushes for lines that are not on a submitted order, QC records pointing at nothing
-- Expect no rows.
select 'submitted line without receipt push' as problem, pl.id::text as ref
  from public.purchase_lines pl join public.purchase_orders po on po.id = pl.purchase_order_id and po.status = 'submitted'
 where pl.active and pl.pushed_at is not null
   and not exists (select 1 from public.inventory_ledger l
                    where l.purchase_line_id = pl.id and l.event_type = 'push' and l.reference_type = 'purchase')
union all
select 'receipt push on a line that is not submitted', l.id::text
  from public.inventory_ledger l join public.purchase_lines pl on pl.id = l.purchase_line_id
  join public.purchase_orders po on po.id = pl.purchase_order_id
 where l.event_type = 'push' and l.reference_type = 'purchase' and (po.status <> 'submitted' or pl.pushed_at is null)
union all
select 'QC record with no batch', q.id::text
  from public.quality_checks q
 where q.purchase_line_id is null and q.production_batch_id is null and q.finished_product_batch_id is null;


-- ## INV-Q1  Approved QC records with no expiry date (rule since FB-0058, 3 Oct 2026). Old records before that date will show.
select q.ar_number, q.status, q.is_retest, q.reviewed_at::date as decided_on
from quality_checks q
where q.status = 'approved' and q.expiry_date is null and not coalesce(q.is_legacy, false)
order by q.reviewed_at desc;

-- ## INV-Q2  More than one open QC record on one batch, or an approved record that is not the latest for its batch
-- (a batch should have one open record at a time, and only its latest record counts)
select 'open records on one batch' as problem, coalesce(purchase_line_id, production_batch_id, finished_product_batch_id)::text as batch_id, count(*) as n
from quality_checks where status in ('submitted', 'checker_approved')
group by coalesce(purchase_line_id, production_batch_id, finished_product_batch_id) having count(*) > 1
union all
select 'approved record is no longer the latest', q.ar_number, null
from quality_checks q
where q.status = 'approved' and q.id <> (
  select x.id from quality_checks x
   where coalesce(x.purchase_line_id, x.production_batch_id, x.finished_product_batch_id) = coalesce(q.purchase_line_id, q.production_batch_id, q.finished_product_batch_id)
   order by x.created_at desc, x.id desc limit 1)
and exists (select 1 from quality_checks y
             where coalesce(y.purchase_line_id, y.production_batch_id, y.finished_product_batch_id) = coalesce(q.purchase_line_id, q.production_batch_id, q.finished_product_batch_id)
               and y.status = 'rejected' and y.created_at > q.created_at and not coalesce(y.is_retest, false));

-- ## INV-Q3  Retest rule breaches (raw material and, since 0120, finished product): more than 3 retests, retest period over 180 days, retest date after expiry date
select 'more than 3 retests' as problem, coalesce(purchase_line_id, production_batch_id, finished_product_batch_id)::text as batch_id, count(*)::text as detail
from quality_checks where is_retest
group by coalesce(purchase_line_id, production_batch_id, finished_product_batch_id) having count(*) > 3
union all
select 'retest period over 180 days', ar_number, retest_period_days::text
from quality_checks where retest_period_days > 180 and not coalesce(is_legacy, false)
union all
select 'retest date after expiry date', ar_number, retest_date::text || ' > ' || expiry_date::text
from quality_checks where retest_date is not null and expiry_date is not null and retest_date > expiry_date and status = 'approved';

-- ## INV-Q4  Duplicate AR numbers ignoring case/spaces, and AR numbers outside the series
-- Series: ARRM-0001/26, ARFP-0001/26; old form AR-001-DDMMYYYY. Opening-stock old AR numbers are free text and will show.
select 'duplicate when case and spaces are ignored' as problem, upper(btrim(ar_number)) as ar, count(*)::text as n
from quality_checks group by upper(btrim(ar_number)) having count(*) > 1
union all
select 'outside the series', ar_number, status
from quality_checks
where ar_number !~ '^AR(RM|FP)-[0-9]{4,}/[0-9]{2}$' and ar_number !~ '^AR-[0-9]{3}-[0-9]{8}$' and not coalesce(is_legacy, false);

-- ## INV-Q5  Two-round decisions that do not follow the rules
select q.ar_number, 'approved without a first (checker) decision' as problem from quality_checks q
 where q.status = 'approved' and q.checker_by is null and not coalesce(q.is_legacy, false)
union all
select q.ar_number, 'approved without reviewer or time' from quality_checks q
 where q.status = 'approved' and (q.reviewed_by is null or q.reviewed_at is null) and not coalesce(q.is_legacy, false)
union all
select q.ar_number, 'reviewer is the same person as checker (not a System Admin)' from quality_checks q
 where q.reviewed_by is not null and q.reviewed_by = q.checker_by
   and not exists (select 1 from user_roles r where r.user_id = q.reviewed_by and r.role = 'system_admin')
union all
select q.ar_number, 'rejected with no comment' from quality_checks q
 where q.status = 'rejected' and coalesce(btrim(q.checker_comments), '') = '' and coalesce(btrim(q.review_comments), '') = '';

-- ## INV-Q6  QC record whose item differs from its batch's item, or whose sample is out of line with the batch
select q.ar_number, 'item differs from batch item' as problem, null::text as detail
from quality_checks q join purchase_lines pl on pl.id = q.purchase_line_id where q.item_id is distinct from pl.item_id
union all
select q.ar_number, 'sample unit not convertible to batch unit or sample larger than the batch', q.sample_qty::text || ' ' || coalesce(q.sample_unit, '?') || ' vs batch ' || pl.quantity::text || ' ' || pl.unit
from quality_checks q join purchase_lines pl on pl.id = q.purchase_line_id
where not coalesce(q.is_legacy, false) and not q.is_retest and q.sample_qty is not null
  and (convert_unit(q.sample_qty, q.sample_unit, pl.unit) is null or convert_unit(q.sample_qty, q.sample_unit, pl.unit) > pl.quantity);

-- ## INV-Q7  Certificates (COA): not tied to an approved QC, more than one per QC record, or header batch number different from the batch
select c.coa_number, 'QC record is not approved' as problem, q.status as detail
from coa_records c join quality_checks q on q.id = c.quality_check_id where q.status <> 'approved'
union all
select min(c.coa_number), 'more than one certificate for the same QC record', count(*)::text
from coa_records c where c.quality_check_id is not null group by c.quality_check_id having count(*) > 1
union all
select c.coa_number, 'header batch number differs from the batch', h.value
from coa_records c
join quality_checks q on q.id = c.quality_check_id
left join purchase_lines pl on pl.id = q.purchase_line_id
left join finished_product_batches fpb on fpb.id = q.finished_product_batch_id
cross join lateral (select e->>'value' as value from jsonb_array_elements(coalesce(c.header_data, '[]'::jsonb)) e
                     where lower(e->>'label') like 'batch no%' limit 1) h
where h.value is not null
  and h.value is distinct from coalesce(pl.batch_number, fpb.batch_number)
  and (fpb.short_batch_no is null or h.value is distinct from fpb.short_batch_no);

-- ## INV-Q8  Approved raw material batches past their expiry date that still have stock (information: they need a decision, there is no write-off for finished product)
select i.item_code, pl.batch_number, s.expiry_date, pl.live_remaining_qty, pl.unit
from purchase_lines pl join items i on i.id = pl.item_id
join purchase_batch_status s on s.purchase_line_id = pl.id
where s.qc_status = 'approved' and s.expiry_date < current_date and pl.live_remaining_qty > 0 and pl.active
order by s.expiry_date;

-- ## INV-Q9  Finished product: packed or issued after the batch's expiry date, or approved with no QC expiry
select fpb.batch_number, q.expiry_date, pi.issue_date, 'packaging issued after expiry' as problem
from packaging_issues pi
join finished_product_batches fpb on fpb.id = pi.finished_product_batch_id
join current_qc_approvals ca on ca.finished_product_batch_id = fpb.id
join quality_checks q on q.id = ca.quality_check_id
where pi.active and q.expiry_date is not null and pi.issue_date > q.expiry_date
union all
select fpb.batch_number, null, null, 'approved finished product batch with no expiry date'
from finished_product_batches fpb
join current_qc_approvals ca on ca.finished_product_batch_id = fpb.id
join quality_checks q on q.id = ca.quality_check_id
where q.expiry_date is null and fpb.active and not coalesce(fpb.is_legacy, false);

-- ## INV-Q10  Batches released but with no QC record at all for a long time (information): raw material on submitted orders with stock and no QC record, older than 14 days
select i.item_code, pl.batch_number, po.submitted_at::date as received, pl.live_remaining_qty, pl.unit
from purchase_lines pl join items i on i.id = pl.item_id and i.category = 'raw'
join purchase_orders po on po.id = pl.purchase_order_id and po.status = 'submitted'
left join purchase_batch_status s on s.purchase_line_id = pl.id
where pl.active and pl.live_remaining_qty > 0 and coalesce(s.qc_status, 'not_submitted') = 'not_submitted'
  and po.submitted_at < now() - interval '14 days'
order by po.submitted_at;


-- ## INV-P1  Components vs ledger: for each batch and each raw material source, what the batch recorded as taken must equal what the ledger shows taken (pulls less cancel reversals)
with comp as (
  select finished_product_batch_id as batch_id, coalesce(purchase_line_id, production_batch_id) as src, sum(quantity) as taken
    from public.finished_product_components group by 1, 2),
led as (
  select l.reference_id as batch_id, coalesce(l.purchase_line_id, l.production_batch_id) as src,
         sum(case when l.reference_type = 'finished_product' and l.event_type = 'pull' then l.quantity
                  when l.reference_type = 'fp_draft_cancelled' and l.event_type = 'push' then -l.quantity else 0 end) as net
    from public.inventory_ledger l
   where l.reference_type in ('finished_product', 'fp_draft_cancelled') group by 1, 2)
select fpb.batch_number, fpb.status, c.src, c.taken, coalesce(l.net, 0) as ledger_net
  from comp c
  join public.finished_product_batches fpb on fpb.id = c.batch_id
  left join led l on l.batch_id = c.batch_id and l.src = c.src
 where fpb.status <> 'cancelled' and c.taken is distinct from coalesce(l.net, 0)
union all
select fpb.batch_number, fpb.status, c.src, c.taken, coalesce(l.net, 0)
  from comp c
  join public.finished_product_batches fpb on fpb.id = c.batch_id
  left join led l on l.batch_id = c.batch_id and l.src = c.src
 where fpb.status = 'cancelled' and coalesce(l.net, 0) <> 0   -- a cancelled batch must net to zero
order by 1;

-- ## INV-P2  A component whose item differs from the item of the raw material batch it draws (SCAN-P5-09)
select fpb.batch_number, i.item_code as component_item, bi.item_code as batch_item, fpc.quantity
  from public.finished_product_components fpc
  join public.finished_product_batches fpb on fpb.id = fpc.finished_product_batch_id
  join public.items i on i.id = fpc.item_id
  left join public.purchase_lines pl on pl.id = fpc.purchase_line_id
  left join public.production_issue_batches pb on pb.id = fpc.production_batch_id
  left join public.items bi on bi.id = coalesce(pl.item_id, pb.item_id)
 where fpc.item_id is distinct from coalesce(pl.item_id, pb.item_id);

-- ## INV-P3  Approved batches: one yield push equal to the batch yield, and sample pulls equal to the sample columns. Batches not approved: none of these.
with led as (
  select reference_id as batch_id,
         sum(case when reference_type = 'fp_yield' and event_type = 'push' then quantity else 0 end) as y,
         count(*) filter (where reference_type = 'fp_yield') as y_rows,
         sum(case when reference_type = 'qc_sample' then quantity else 0 end) as q,
         sum(case when reference_type = 'stability_sample' then quantity else 0 end) as s,
         sum(case when reference_type = 'rnd_sample' then quantity else 0 end) as r
    from public.inventory_ledger
   where reference_type in ('fp_yield', 'qc_sample', 'stability_sample', 'rnd_sample') group by 1)
select fpb.batch_number, fpb.status, fpb.batch_yield, l.y as ledger_yield, l.y_rows,
       fpb.qc_sample_qty, l.q as ledger_qc, fpb.stability_qty, l.s as ledger_stability, fpb.rnd_qty, l.r as ledger_rnd
  from public.finished_product_batches fpb
  left join led l on l.batch_id = fpb.id
 where not fpb.is_legacy and fpb.opening_load_id is null
   and ( (fpb.status = 'approved' and (coalesce(l.y_rows, 0) <> 1 or coalesce(l.y, 0) is distinct from coalesce(fpb.batch_yield, 0)
          or coalesce(l.q, 0) is distinct from coalesce(fpb.qc_sample_qty, 0)
          or coalesce(l.s, 0) is distinct from coalesce(fpb.stability_qty, 0)
          or coalesce(l.r, 0) is distinct from coalesce(fpb.rnd_qty, 0)))
      or (fpb.status <> 'approved' and coalesce(l.y_rows, 0) > 0) );

-- ## INV-P4  Batch status against its QC record
with lastqc as (
  select distinct on (finished_product_batch_id) finished_product_batch_id as batch_id, status, ar_number, is_retest
    from public.quality_checks where finished_product_batch_id is not null
   order by finished_product_batch_id, created_at desc, id desc)
select fpb.batch_number, fpb.status as batch_status, q.status as qc_status, q.ar_number
  from public.finished_product_batches fpb
  left join lastqc q on q.batch_id = fpb.id
 where not fpb.is_legacy and fpb.opening_load_id is null
   and ( (fpb.status in ('draft', 'in_process', 'complete_awaiting_qc', 'cancelled') and q.batch_id is not null)
      or (fpb.status = 'submitted_to_qc' and q.status is distinct from 'submitted')
      or (fpb.status = 'approved' and q.status is distinct from 'approved' and not coalesce(q.is_retest, false))  -- since 0120 a retest (open or rejected) leaves the batch status approved
      or (fpb.status = 'rejected' and q.status is distinct from 'rejected') );

-- ## INV-P5  Completion fields and dates (rules that are on the screen only: SCAN-P5-06)
select fpb.batch_number, fpb.status, fpb.batch_start_date, fpb.finish_date, fpb.expiry_month, md.approved_at::date as mfr_approved_on,
       case when fpb.finish_date > (now() at time zone 'Asia/Kolkata')::date then 'finish date in the future'
            when fpb.expiry_month is not null and fpb.finish_date is not null and fpb.expiry_month <= fpb.finish_date then 'expiry not after finish'
            when fpb.batch_start_date is not null and fpb.finish_date is not null and fpb.finish_date < fpb.batch_start_date then 'finish before start'
            when fpb.batch_start_date is not null and md.approved_at is not null and fpb.batch_start_date < (md.approved_at at time zone 'Asia/Kolkata')::date then 'started before the MFR was approved'
            when fpb.batch_start_date > (now() at time zone 'Asia/Kolkata')::date then 'start date in the future'
            when fpb.status in ('complete_awaiting_qc', 'submitted_to_qc', 'approved', 'rejected')
                 and (fpb.batch_yield is null or fpb.finish_date is null or fpb.expiry_month is null or fpb.qc_sample_qty is null or fpb.stability_qty is null) then 'completed but a completion field is empty'
       end as problem
  from public.finished_product_batches fpb
  join public.mfr_definitions md on md.id = fpb.mfr_definition_id
 where not fpb.is_legacy and fpb.opening_load_id is null
   and ( fpb.finish_date > (now() at time zone 'Asia/Kolkata')::date
      or (fpb.expiry_month is not null and fpb.finish_date is not null and fpb.expiry_month <= fpb.finish_date)
      or (fpb.batch_start_date is not null and fpb.finish_date is not null and fpb.finish_date < fpb.batch_start_date)
      or (fpb.batch_start_date is not null and md.approved_at is not null and fpb.batch_start_date < (md.approved_at at time zone 'Asia/Kolkata')::date)
      or fpb.batch_start_date > (now() at time zone 'Asia/Kolkata')::date
      or (fpb.status in ('complete_awaiting_qc', 'submitted_to_qc', 'approved', 'rejected')
          and (fpb.batch_yield is null or fpb.finish_date is null or fpb.expiry_month is null or fpb.qc_sample_qty is null or fpb.stability_qty is null)) );

-- ## INV-P6  Drafts that should have been cancelled (older than 30 minutes) and batches In progress for more than 30 days
select fpb.batch_number, fpb.status, fpb.created_at, fpb.batch_start_date,
       case when fpb.status = 'draft' then 'stale draft still holding raw material' else 'in progress for over 30 days' end as problem
  from public.finished_product_batches fpb
 where (fpb.status = 'draft' and fpb.created_at < now() - interval '30 minutes')
    or (fpb.status = 'in_process' and fpb.batch_start_date < (now() at time zone 'Asia/Kolkata')::date - 30)
 order by fpb.created_at;

-- ## INV-P7  Batch numbers: not in the generated shape for the product, a short number that does not match, or repeated short numbers for one MFR
select fpb.batch_number, fpb.short_batch_no, i.item_code, 'number not in the form <item code>-<seq>/<yy>' as problem
  from public.finished_product_batches fpb
  join public.mfr_definitions md on md.id = fpb.mfr_definition_id
  left join public.items i on i.id = md.finished_product_item_id
 where not fpb.is_legacy and fpb.opening_load_id is null
   and (i.item_code is null or fpb.batch_number !~ ('^' || i.item_code || '-[0-9]{2,}/[0-9]{2}$'))
union all
select fpb.batch_number, fpb.short_batch_no, null, 'short number does not follow the batch number'
  from public.finished_product_batches fpb
 where not fpb.is_legacy and fpb.opening_load_id is null and fpb.short_batch_no is not null
   and substring(fpb.short_batch_no from '-([0-9]+/[0-9]{2})$') is distinct from substring(fpb.batch_number from '-([0-9]+/[0-9]{2})$')
union all
select min(fpb.batch_number), fpb.short_batch_no, null, 'short number used by more than one batch of the same MFR'
  from public.finished_product_batches fpb
 where fpb.short_batch_no is not null and fpb.active
 group by fpb.mfr_definition_id, fpb.short_batch_no having count(*) > 1;

-- ## INV-P8  Yield sanity: actual yield outside 50% to 150% of the batch size (set your own limits), samples above yield, packed above what is left
select fpb.batch_number, fpb.status, fpb.target_qty, fpb.batch_yield, round(fpb.batch_yield / nullif(fpb.target_qty, 0) * 100, 1) as yield_pct,
       fpb.qc_sample_qty, fpb.stability_qty, fpb.rnd_qty, fpb.packaged_qty
  from public.finished_product_batches fpb
 where not fpb.is_legacy and fpb.opening_load_id is null and fpb.batch_yield is not null
   and ( fpb.batch_yield / nullif(fpb.target_qty, 0) not between 0.5 and 1.5
      or fpb.batch_yield - coalesce(fpb.qc_sample_qty, 0) - coalesce(fpb.stability_qty, 0) - coalesce(fpb.rnd_qty, 0) - coalesce(fpb.retest_sample_qty, 0) < coalesce(fpb.packaged_qty, 0) )
 order by fpb.created_at;

-- ## INV-P9  Specks: a raw material batch holding less than 0.0005 but more than zero, and components with more than 3 decimals (SCAN-P5-08)
select 'purchase batch' as kind, pl.batch_number as ref, pl.live_remaining_qty::text as value
  from public.purchase_lines pl where pl.live_remaining_qty > 0 and pl.live_remaining_qty < 0.0005
union all
select 'production batch', pb.batch_number::text, pb.live_remaining_qty::text
  from public.production_issue_batches pb where pb.live_remaining_qty > 0 and pb.live_remaining_qty < 0.0005
union all
select 'component with more than 3 decimals', fpb.batch_number, fpc.quantity::text
  from public.finished_product_components fpc join public.finished_product_batches fpb on fpb.id = fpc.finished_product_batch_id
 where fpc.quantity <> round(fpc.quantity, 3);

-- ## INV-P10  Batches against an MFR that is unapproved, deactivated now (open batches only), or of a different version (SCAN-P5-06)
select fpb.batch_number, fpb.status, md.code, md.version as mfr_version, fpb.mfr_version as batch_version,
       md.approved_at is not null as mfr_approved, md.active as mfr_active
  from public.finished_product_batches fpb
  join public.mfr_definitions md on md.id = fpb.mfr_definition_id
 where not fpb.is_legacy and fpb.opening_load_id is null
   and ( md.approved_at is null
      or fpb.mfr_version is distinct from md.version
      or (not md.active and fpb.status in ('draft', 'in_process')) );


-- ## INV-K1  Each packaging issue against the ledger: product pulled (all departments), and for Store and R&D the packs added and issued (unit count)
with led as (
  select reference_id as issue_id,
         sum(case when reference_type = 'fp_packaging_pull' and event_type = 'pull' then quantity else 0 end) as fp_pull,
         sum(case when reference_type = 'packaged_fp_yield' and event_type = 'push' then quantity else 0 end) as packs_in,
         sum(case when reference_type = 'packaged_fp_issue' and event_type = 'pull' then quantity else 0 end) as packs_out
    from public.inventory_ledger
   where reference_type in ('fp_packaging_pull', 'packaged_fp_yield', 'packaged_fp_issue') group by 1)
select pi.code, pi.department, pi.fp_qty_consumed, l.fp_pull, pi.unit_count, l.packs_in, l.packs_out
  from public.packaging_issues pi
  left join led l on l.issue_id = pi.id
 where coalesce(pi.fp_qty_consumed, 0) > 0
   and ( coalesce(l.fp_pull, 0) is distinct from pi.fp_qty_consumed
      or (pi.department in ('store', 'rnd') and (coalesce(l.packs_in, 0) is distinct from pi.unit_count or coalesce(l.packs_out, 0) is distinct from pi.unit_count))
      or (pi.department = 'production' and (coalesce(l.packs_in, 0) <> 0 or coalesce(l.packs_out, 0) <> 0)) )
 order by pi.code;

-- ## INV-K2  Packaging materials against the ledger: for each issue and material, the quantity on the line equals the packaging pulls in the ledger
with led as (
  select reference_id as issue_id, item_id, sum(quantity) as pulled
    from public.inventory_ledger where reference_type = 'packaging' and event_type = 'pull' group by 1, 2),
lines as (
  select packaging_issue_id as issue_id, item_id, sum(quantity) as used from public.packaging_issue_items group by 1, 2)
select pi.code, i.item_code, l.used as line_qty, coalesce(g.pulled, 0) as ledger_pulled
  from lines l
  join public.packaging_issues pi on pi.id = l.issue_id
  join public.items i on i.id = l.item_id
  left join led g on g.issue_id = l.issue_id and g.item_id = l.item_id
 where l.used is distinct from coalesce(g.pulled, 0)
union all
select pi.code, i.item_code, 0, g.pulled
  from led g
  join public.packaging_issues pi on pi.id = g.issue_id
  join public.items i on i.id = g.item_id
  where not exists (select 1 from lines l where l.issue_id = g.issue_id and l.item_id = g.item_id)
order by 1;

-- ## INV-K3  A finished product batch with more product issued than it ever had: issued + samples above yield
select fpb.batch_number, fpb.batch_yield,
       coalesce(fpb.qc_sample_qty,0) + coalesce(fpb.stability_qty,0) + coalesce(fpb.rnd_qty,0) + coalesce(fpb.retest_sample_qty,0) as samples,
       iss.bulk as product_issued
  from public.finished_product_batches fpb
  join lateral (select coalesce(sum(pi.fp_qty_consumed), 0) as bulk from public.packaging_issues pi where pi.finished_product_batch_id = fpb.id) iss on true
 where fpb.batch_yield is not null
   and iss.bulk + coalesce(fpb.qc_sample_qty,0) + coalesce(fpb.stability_qty,0) + coalesce(fpb.rnd_qty,0) + coalesce(fpb.retest_sample_qty,0) > fpb.batch_yield + 0.0000001;

-- ## INV-K4  Pack count on the batch (packaged_qty) against the unit counts of its Store and R&D issues
select fpb.batch_number, fpb.packaged_qty, coalesce(s.packs, 0) as packs_on_issues
  from public.finished_product_batches fpb
  left join (select finished_product_batch_id, sum(unit_count) as packs from public.packaging_issues where department <> 'production' group by 1) s
         on s.finished_product_batch_id = fpb.id
 where fpb.packaged_qty is distinct from coalesce(s.packs, 0);

-- ## INV-K5  Production issues and the raw material batch they make: one batch per Production issue, none for Store or R&D, quantity and samples equal to the issue
select pi.code, pi.department, pi.fp_qty_consumed, pb.batch_number, pb.quantity, pb.qc_qty, pi.qc_qty as issue_qc, pb.stability_qty, pi.stability_qty as issue_stability, pb.rnd_qty, pi.rnd_qty as issue_rnd,
       (select count(*) from public.production_issue_batches x where x.packaging_issue_id = pi.id) as batches
  from public.packaging_issues pi
  left join public.production_issue_batches pb on pb.packaging_issue_id = pi.id
 where (pi.department = 'production' and (pb.id is null
          or pb.quantity is distinct from pi.fp_qty_consumed
          or coalesce(pb.qc_qty,0) is distinct from coalesce(pi.qc_qty,0)
          or coalesce(pb.stability_qty,0) is distinct from coalesce(pi.stability_qty,0)
          or coalesce(pb.rnd_qty,0) is distinct from coalesce(pi.rnd_qty,0)
          or (select count(*) from public.production_issue_batches x where x.packaging_issue_id = pi.id) <> 1))
    or (pi.department <> 'production' and pb.id is not null);

-- ## INV-K6  An issue against a batch that is not approved now, or dated before the batch's QC approval or in the future (SCAN-P6-02)
select pi.code, fpb.batch_number, fpb.status as batch_status, pi.issue_date, (q.reviewed_at at time zone 'Asia/Kolkata')::date as approved_on,
       case when fpb.status <> 'approved' then 'batch not approved'
            when pi.issue_date < (q.reviewed_at at time zone 'Asia/Kolkata')::date then 'issued before the QC approval'
            when pi.issue_date > (now() at time zone 'Asia/Kolkata')::date then 'issue date in the future' end as problem
  from public.packaging_issues pi
  join public.finished_product_batches fpb on fpb.id = pi.finished_product_batch_id
  left join lateral (select x.reviewed_at from public.quality_checks x where x.finished_product_batch_id = fpb.id and x.status = 'approved' order by x.created_at desc limit 1) q on true
 where pi.opening_load_id is null and not fpb.is_legacy
   and ( fpb.status <> 'approved'
      or pi.issue_date < (q.reviewed_at at time zone 'Asia/Kolkata')::date
      or pi.issue_date > (now() at time zone 'Asia/Kolkata')::date );

-- ## INV-K7  Issue codes: outside the PKG-nnnn form, and gaps in the series (gaps are informational: failed saves use up numbers, SCAN-P4-07 / P6)
select code, 'not in the PKG-nnnn form' as problem from public.packaging_issues where code !~ '^PKG-[0-9]{4,}$' and opening_load_id is null
union all
select 'PKG-' || lpad(g::text, 4, '0'), 'missing number in the series (informational)'
  from (select min((substring(code from '[0-9]+$'))::int) lo, max((substring(code from '[0-9]+$'))::int) hi from public.packaging_issues where code ~ '^PKG-[0-9]{4,}$') r,
       generate_series(r.lo, r.hi) g
 where not exists (select 1 from public.packaging_issues p where p.code = 'PKG-' || lpad(g::text, 4, '0'));

-- ## INV-K8  Store and R&D issues with no packaging material, and materials that are not packaging items (SCAN-P6-02)
select pi.code, 'no packaging material on the issue' as problem, null as item_code
  from public.packaging_issues pi
 where pi.department in ('store', 'rnd') and pi.opening_load_id is null
   and not exists (select 1 from public.packaging_issue_items x where x.packaging_issue_id = pi.id)
union all
select pi.code, 'material is not a packaging item', i.item_code
  from public.packaging_issue_items x
  join public.packaging_issues pi on pi.id = x.packaging_issue_id
  join public.items i on i.id = x.item_id
 where i.category <> 'packaging';

-- ## INV-K9  Pack count against the product used: pack size times unit count differs from the product consumed by more than 2% (SCAN-P6-02)
select pi.code, pi.pack_size, pi.unit_count, pi.fp_qty_consumed,
       public.convert_unit(pi.pack_size_qty * pi.unit_count, pi.pack_size_unit, fi.unit) as implied_product
  from public.packaging_issues pi
  join public.finished_product_batches fpb on fpb.id = pi.finished_product_batch_id
  join public.mfr_definitions md on md.id = fpb.mfr_definition_id
  join public.items fi on fi.id = md.finished_product_item_id
 where pi.department in ('store', 'rnd') and pi.pack_size_qty is not null and pi.pack_size_unit is not null and pi.opening_load_id is null
   and public.convert_unit(pi.pack_size_qty * pi.unit_count, pi.pack_size_unit, fi.unit) is not null
   and abs(public.convert_unit(pi.pack_size_qty * pi.unit_count, pi.pack_size_unit, fi.unit) - pi.fp_qty_consumed) > 0.02 * pi.fp_qty_consumed;

-- ## INV-K10  Production raw material batches approved with no QC sample, or with an expiry later than the finished product batch they came from (SCAN-P6-04)
select pb.batch_number, pb.qc_qty, s.expiry_date as batch_expiry, fq.expiry_date as source_expiry, fpb.batch_number as source_batch,
       case when coalesce(pb.qc_qty, 0) = 0 then 'approved with no QC sample' else 'expiry later than the source batch' end as problem
  from public.production_issue_batches pb
  join public.production_batch_status s on s.production_batch_id = pb.id and s.qc_status = 'approved'
  join public.packaging_issues pi on pi.id = pb.packaging_issue_id
  join public.finished_product_batches fpb on fpb.id = pi.finished_product_batch_id
  left join lateral (select x.expiry_date from public.quality_checks x where x.finished_product_batch_id = fpb.id and x.status = 'approved' order by x.created_at desc limit 1) fq on true
 where coalesce(pb.qc_qty, 0) = 0
    or (fq.expiry_date is not null and s.expiry_date > fq.expiry_date);

-- ## INV-K11  Expiry & Retest Ageing finished product quantity against the true bulk left (SCAN-P6-06; no rows once the view is fixed)
select a.batch_label, a.remaining_qty as ageing_shows,
       greatest(f.batch_yield - coalesce(f.qc_sample_qty,0) - coalesce(f.stability_qty,0) - coalesce(f.rnd_qty,0) - coalesce(f.retest_sample_qty,0) - coalesce(iss.bulk,0), 0) as true_left
  from public.batch_ageing a
  join public.finished_product_batches f on f.id = a.batch_id
  left join lateral (select sum(pi.fp_qty_consumed) as bulk from public.packaging_issues pi where pi.finished_product_batch_id = f.id) iss on true
 where a.kind = 'fp'
   and abs(a.remaining_qty - greatest(f.batch_yield - coalesce(f.qc_sample_qty,0) - coalesce(f.stability_qty,0) - coalesce(f.rnd_qty,0) - coalesce(f.retest_sample_qty,0) - coalesce(iss.bulk,0), 0)) > 0.0005;

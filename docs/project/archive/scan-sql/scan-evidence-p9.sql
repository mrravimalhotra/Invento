-- ============================================================
-- Scan evidence — Phase 9 (missing functionality). Read-only; safe to run on the live database.
-- ============================================================

-- Section P9-A: every table in the app. None holds deviations, OOS, change control, CAPA, complaints,
-- training, stock counts, returns or sample disposal records (compare the list with SCAN-P9-01, 04, 05, 08).
select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;

-- Section P9-B: what a vendor and a receipt line can hold today (SCAN-P9-02).
select table_name, string_agg(column_name, ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public' and table_name in ('vendors', 'purchase_orders', 'purchase_lines')
group by table_name order by table_name;

-- Section P9-C: what a finished-product batch and a QC record can hold today (SCAN-P9-03).
select table_name, string_agg(column_name, ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public' and table_name in ('finished_product_batches', 'quality_checks')
group by table_name order by table_name;

-- Live read-only check 10: how many vendors are used on purchases, and how many have neither phone, mobile nor e-mail
-- (shows how little of the vendor master is filled in today).
select (select count(*) from vendors where active) as active_vendors,
       (select count(distinct vendor_id) from purchase_orders) as vendors_with_purchases,
       (select count(*) from vendors where active and coalesce(nullif(trim(mobile), ''), nullif(trim(phone), ''), nullif(trim(email), '')) is null) as no_contact_at_all;

-- Live read-only check 11: rejected raw-material batches still sitting in stock with nothing recorded about what happened to them (SCAN-P9-04).
select count(*) as rejected_batches_with_stock
from rejected_batches;

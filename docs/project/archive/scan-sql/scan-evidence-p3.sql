-- Scan evidence, Phase 3. Run on a SCRATCH copy of the local test database only (never on live).
-- Same seed as scan-evidence-p1.sql (users a1..a6, item c3 raw, c9 finished product, vendor c2). t_ok helper prints ALLOWED or REFUSED.

-- ===== P3.1 reopen after QC approval (SCAN-P3-01) and empty PO (SCAN-P3-03) =====
\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
-- vendor id c2, item c3 (raw), users: a1 admin, a2 inventory manager, a4 checker, a5 reviewer
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values
 ('00000000-0000-0000-0000-00000000d311','PO-S1','00000000-0000-0000-0000-0000000000c2','INV-S1',current_date),
 ('00000000-0000-0000-0000-00000000d312','PO-S2','00000000-0000-0000-0000-0000000000c2','INV-S2',current_date);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values
 ('00000000-0000-0000-0000-00000000e311','00000000-0000-0000-0000-00000000d311','00000000-0000-0000-0000-0000000000c3','S1-B1',100,'kg',1,0,0,10,5);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('A submit an EMPTY purchase order (no lines)', $q$select submit_purchase_order('00000000-0000-0000-0000-00000000d312')$q$);
select t_ok('B submit PO with one line', $q$select submit_purchase_order('00000000-0000-0000-0000-00000000d311')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('C QC round 1', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-00000000f311','AR-S1','00000000-0000-0000-0000-00000000e311','00000000-0000-0000-0000-0000000000c3',1,'kg'); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-00000000f311'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('D QC round 2 approve', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-00000000f311'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('E admin reopens the PO whose batch is QC-approved', $q$select reopen_purchase_order('00000000-0000-0000-0000-00000000d311')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('F change line quantity 100 -> 40 kg and sample qty on the approved batch', $q$update purchase_lines set quantity=40, qc_qty=2 where id='00000000-0000-0000-0000-00000000e311'$q$);
select t_ok('G change the batch number of the approved batch', $q$update purchase_lines set batch_number='S1-B1-CHANGED' where id='00000000-0000-0000-0000-00000000e311'$q$);
select t_ok('H change which item the approved batch is for', $q$update purchase_lines set item_id='00000000-0000-0000-0000-0000000000c9' where id='00000000-0000-0000-0000-00000000e311'$q$);
select t_ok('I re-submit', $q$select submit_purchase_order('00000000-0000-0000-0000-00000000d311')$q$);
reset role;
select 'result: qty=' || pl.quantity || ' batch=' || pl.batch_number || ' item=' || i.item_code || ' qc=' || coalesce((select status from quality_checks where purchase_line_id=pl.id),'none') || ' sample_in_qc=' || coalesce((select sample_qty::text from quality_checks where purchase_line_id=pl.id),'-') from purchase_lines pl join items i on i.id=pl.item_id where pl.id='00000000-0000-0000-0000-00000000e311';
select 'empty PO status: ' || status from purchase_orders where id='00000000-0000-0000-0000-00000000d312';
rollback;

-- ===== P3.2 stock invariants: run claude/scan-invariants-stock.sql on each of these scratch databases after the suite =====
-- Suites used (each loaded into a fresh copy of the fresh install): r_po_reopen, p_packaging, part_b16_fifo, rejected_materials_0104, ageing_samples_0108, b_batch_numbers_retests.
-- Result: S1 (on-hand decomposition), S4 to S7 returned no rows on any of them. S2/S3 returned no rows once rejected moves were excluded and the production batch base quantity was added;
-- part_b16_fifo shows 2 rows because that suite overwrites live_remaining_qty by hand as test set-up (expected).

-- ===== P3.2 / P3.3 wastage with a blank reason, by a QC Reviewer (SCAN-P3 carried item) =====
\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
\echo === QC Reviewer (no purchase or inventory role) writes off stock with a blank reason
select t_ok('A wastage by qc_reviewer, reason empty', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3', (select id from purchase_lines order by created_at limit 1), 0.5, 'kg', '')$q$);
select t_ok('B wastage, reason NULL', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3', (select id from purchase_lines order by created_at limit 1), 0.5, 'kg', null)$q$);
reset role;
select 'wastage rows: ' || count(*) || ', blank reasons: ' || count(*) filter (where coalesce(btrim(reason),'') = '') from inventory_ledger where event_type = 'wastage';
rollback;

-- ## P3.3 wastage (scanx scratch database)
\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
\echo === QC Reviewer (no purchase or inventory role) writes off stock with a blank reason
select t_ok('A wastage by qc_reviewer, reason empty', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3', (select id from purchase_lines order by created_at limit 1), 0.5, 'kg', '')$q$);
select t_ok('B wastage, reason NULL', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3', (select id from purchase_lines order by created_at limit 1), 0.5, 'kg', null)$q$);
reset role;
select 'wastage rows: ' || count(*) || ', blank reasons: ' || count(*) filter (where coalesce(btrim(reason),'') = '') from inventory_ledger where event_type = 'wastage';
rollback;

\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
select 'lines: ' || count(*) filter (where po.status='submitted') || ' submitted; qc records: ' || (select count(*) from quality_checks) from purchase_lines pl join purchase_orders po on po.id=pl.purchase_order_id;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
\echo === QC Checker writes off 0.5 kg of a batch not yet approved by QC, reason = single space
select t_ok('C wastage on not-yet-approved batch by quality_checker, reason one space', $q$select record_wastage(null, (select pl.id from purchase_lines pl join purchase_orders po on po.id=pl.purchase_order_id where po.status='submitted' and pl.unit='kg' order by pl.created_at limit 1), 0.5, 'kg', ' ')$q$);
reset role;
select 'wastage rows: ' || count(*) || ', reason blank after trim: ' || count(*) filter (where coalesce(btrim(reason),'')='') from inventory_ledger where event_type='wastage';
select 'qc status of that line: ' || coalesce((select string_agg(distinct status,',') from quality_checks),'no QC record');
rollback;

-- ## P3.4 Stock Statement shows an opening load as Purchased (scanx)
\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
update opening_stock_settings set is_open = true where true;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select load_no from load_opening_stock('raw', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"OLD-EXP-9","quantity":10,"receipt_date":"2024-01-10","expiry_date":"2030-01-10","unit_price":null,"gst_pct":null,"qc_status":"pending","old_ar":null,"approval_date":null,"retest_date":null,"retests_done":0}]'::jsonb);
\echo === Stock Statement for this month: the 10 kg opening load
select item_code, opening, purchased, other_in, closing from stock_statement(date_trunc('month', now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date, 'raw') where item_code = 'RM-T0001';
\echo === Statement for last month (before the load)
select item_code, opening, purchased, closing from stock_statement((date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month')::date, (date_trunc('month', now() at time zone 'Asia/Kolkata')::date - 1), 'raw') where item_code = 'RM-T0001';
rollback;

-- ## P3.4 finished product ledger vs batches (run on each database)
-- processed items: ledger on-hand vs sum of finished-product batch bulk remaining (corrected in P6.3: bulk used = fp_qty_consumed on packaging issues, approved batches only)
with b as (
  select md.finished_product_item_id item_id,
         sum(greatest(coalesce(fpb.batch_yield,0)-coalesce(fpb.qc_sample_qty,0)-coalesce(fpb.stability_qty,0)-coalesce(fpb.rnd_qty,0)-coalesce(iss.bulk,0),0)) bulk
    from finished_product_batches fpb join mfr_definitions md on md.id=fpb.mfr_definition_id
    left join lateral (select sum(pi.fp_qty_consumed) bulk from packaging_issues pi where pi.finished_product_batch_id=fpb.id) iss on true
   where fpb.active and fpb.status = 'approved' group by 1)
select i.item_code, round(coalesce(sb.on_hand,0),3) ledger_on_hand, round(b.bulk,3) batch_bulk
  from b join items i on i.id=b.item_id left join stock_balance sb on sb.item_id=i.id
 where abs(coalesce(sb.on_hand,0)-b.bulk) > 0.0005;

-- ## P3.5 stored remaining quantity cannot be set by hand (scanx)
\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
\echo === Inventory Manager edits the stored remaining quantity directly (submitted PO line)
select t_ok('A set live_remaining_qty=999 on a submitted line', $q$update purchase_lines set live_remaining_qty = 999 where id = (select pl.id from purchase_lines pl join purchase_orders po on po.id=pl.purchase_order_id where po.status='submitted' limit 1)$q$);
reset role;
select 'live_remaining_qty now: ' || max(live_remaining_qty) from purchase_lines;
select 'ledger net for that line: ' || coalesce(sum(case event_type when 'push' then quantity else -quantity end),0) from inventory_ledger where purchase_line_id = (select id from purchase_lines order by live_remaining_qty desc limit 1);
rollback;

\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values
 ('00000000-0000-0000-0000-00000000d351','PO-L1','00000000-0000-0000-0000-0000000000c2','INV-L1',current_date);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values
 ('00000000-0000-0000-0000-00000000e351','00000000-0000-0000-0000-00000000d351','00000000-0000-0000-0000-0000000000c3','L1-B1',100,'kg',1,0,0,10,5);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('A draft line: set live_remaining_qty = 500 directly', $q$update purchase_lines set live_remaining_qty = 500 where id='00000000-0000-0000-0000-00000000e351'$q$);
select t_ok('B submit the order', $q$select submit_purchase_order('00000000-0000-0000-0000-00000000d351')$q$);
reset role;
select 'batch remaining after submit: ' || live_remaining_qty || ' (expected 99 = 100 less 1 QC sample)' from purchase_lines where id='00000000-0000-0000-0000-00000000e351';
select 'ledger net for the batch: ' || sum(case event_type when 'push' then quantity else -quantity end) from inventory_ledger where purchase_line_id='00000000-0000-0000-0000-00000000e351';
rollback;

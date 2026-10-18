-- Phase 6 evidence: reproductions run only on a local scratch copy; never run on a real database.
\set ON_ERROR_STOP off
\pset footer off
reset role;
-- ids: FP-1 a6c136e1.. (approved), FP-3 adfaf27a.. (approved). packaging item c5 (nos, 87 in stock), raw c3, FP item 9aa093ba
create temp table _v as select 'ok'::text k; grant all on _v to public;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('K1 valid store issue: 2 kg of FP-1 into 4 packs, 4 bottles', $q$select create_packaging_issue('{"code":"PKG-SCAN-1","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":2,"unit_count":4,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":4,"unit":"nos"}]'::jsonb)$q$);
select t_ok('K2 issue with NO packaging material at all', $q$select create_packaging_issue('{"code":"PKG-SCAN-2","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":1,"unit_count":2,"department":"store"}'::jsonb, '[]'::jsonb)$q$);
select t_ok('K3 unit count 1000 but only 0.5 kg of product consumed', $q$select create_packaging_issue('{"code":"PKG-SCAN-3","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"500 g","pack_size_qty":500,"pack_size_unit":"g","fp_qty_consumed":0.5,"unit_count":1000,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select t_ok('K4 a RAW material (RM-T0001) used as a packaging material', $q$select create_packaging_issue('{"code":"PKG-SCAN-4","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":1,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb)$q$);
select t_ok('K5 free-text code "XYZ" instead of the PKG series', $q$select create_packaging_issue('{"code":"XYZ","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":1,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select t_ok('K6 issue date in 2020, before the batch existed', $q$select create_packaging_issue('{"code":"PKG-SCAN-6","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":1,"department":"store","issue_date":"2020-01-01"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select t_ok('K7 unit count negative', $q$select create_packaging_issue('{"code":"PKG-SCAN-7","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":-5,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select t_ok('K8 pack size says 500 ml but product is a kg item, qty 0', $q$select create_packaging_issue('{"code":"PKG-SCAN-8","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"nonsense","pack_size_qty":0,"pack_size_unit":"ml","fp_qty_consumed":0.5,"unit_count":1,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
reset role;
update finished_product_batches set status='in_process' where batch_number='FP-3';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('K9 issue against a batch that is only In progress (not approved)', $q$select create_packaging_issue('{"code":"PKG-SCAN-9","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":1,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('K10 QC reviewer (no packaging role) issues', $q$select create_packaging_issue('{"code":"PKG-SCAN-10","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":1,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('K11 admin tries to delete an issue', $q$delete from packaging_issues where code='PKG-SCAN-1'$q$);
select t_ok('K12 admin tries to change an issue (fp_qty_consumed to 1)', $q$update packaging_issues set fp_qty_consumed=1 where code='PKG-SCAN-1'$q$);
reset role;
select 'issues now: ' || string_agg(code || '=' || fp_qty_consumed || '/' || unit_count, ', ' order by created_at) from packaging_issues where code like 'PKG-SCAN%' or code='XYZ';
select 'PKG-SCAN-1 still there with fp_qty_consumed ' || fp_qty_consumed from packaging_issues where code='PKG-SCAN-1';
select 'FP-1 packaged_qty: ' || packaged_qty from finished_product_batches where batch_number='FP-1';
select 'packaged item on hand: ' || coalesce((select on_hand::text from stock_balance where item_id='3e7f1a2d-c3de-48eb-b680-9fd0ffd5cd51'),'none');
select 'K4 ledger: ' || string_agg(i.item_code||' '||l.event_type||' '||l.quantity, '; ') from inventory_ledger l join items i on i.id=l.item_id join packaging_issues p on p.id=l.reference_id where p.code='PKG-SCAN-4';
\set ON_ERROR_STOP off
\pset footer off
reset role;
-- parent finished product batch of PROD-02: its expiry from its own QC approval
create temp table _p as select pb.id pid, pb.batch_number, pb.item_id, pb.packaging_issue_id, pi.finished_product_batch_id fpb from production_issue_batches pb join packaging_issues pi on pi.id=pb.packaging_issue_id; grant all on _p to public;
select 'parent FP batch of PROD-02: ' || f.batch_number || ' expiry_month=' || coalesce(f.expiry_month::text,'-') || ' (QC expiry ' || coalesce((select expiry_date::text from quality_checks q where q.finished_product_batch_id=f.id order by created_at desc limit 1),'-') || ')' from _p join finished_product_batches f on f.id=_p.fpb where _p.batch_number='PROD-02/26';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('Q1 create QC record for PROD-02 (QC sample quantity 0)', $q$insert into quality_checks (ar_number, production_batch_id, item_id, sample_qty, sample_unit, created_by) select get_next_ar_number(), pid, item_id, 0, 'kg', '00000000-0000-0000-0000-0000000000a4' from _p where batch_number='PROD-02/26'$q$);
select t_ok('Q2 round 1 approve', $q$update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where production_batch_id=(select pid from _p where batch_number='PROD-02/26')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('Q3 round 2 approve with expiry 2031-12-31 (years after the source batch expiry)', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=180, expiry_date='2031-12-31', retest_date=current_date+180 where production_batch_id=(select pid from _p where batch_number='PROD-02/26')$q$);
reset role;
select 'PROD-02 state: ' || s.qc_status || ' expiry=' || coalesce(s.expiry_date::text,'-') || ' retest=' || coalesce(s.retest_date::text,'-') || ' sample_qty=' || (select sample_qty from quality_checks where production_batch_id=s.production_batch_id) from production_batch_status s where s.production_batch_id=(select pid from _p where batch_number='PROD-02/26');
select 'PROD-02 remaining=' || live_remaining_qty from production_issue_batches where id=(select pid from _p where batch_number='PROD-02/26');
-- Is the parent FP batch's expiry known on the production batch at all?
select 'columns on production_issue_batches: ' || string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where table_name='production_issue_batches';
-- can PROD-01 (not submitted to QC) be drawn into a batch? and PROD-02 (approved)?
-- use in Compose (database path)
create temp table _m2 as select id from mfr_definitions limit 1; grant all on _m2 to public;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('U1 draw from PROD-01 (never submitted to QC)', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-PR1','mfr_definition_id',%L,'mfr_version',1,'target_qty',1,'unit','kg','batch_start_date',to_char(now(),'YYYY-MM-DD')), jsonb_build_array(jsonb_build_object('item_id','ab8d9c93-45c1-4747-a846-c7409e6c4090','production_batch_id',(select id from production_issue_batches where batch_number='PROD-01/26'),'quantity',0.1)))$q$,(select id from _m2)));
select t_ok('U2 draw from PROD-02 (approved with zero sample)', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-PR2','mfr_definition_id',%L,'mfr_version',1,'target_qty',1,'unit','kg','batch_start_date',to_char(now(),'YYYY-MM-DD')), jsonb_build_array(jsonb_build_object('item_id','ab8d9c93-45c1-4747-a846-c7409e6c4090','production_batch_id',(select id from production_issue_batches where batch_number='PROD-02/26'),'quantity',0.1)))$q$,(select id from _m2)));
-- ===== above: p62_prodrm.sql (P6.2) =====
-- ===== p63_ageing.sql (P6.3) =====
-- P6.3: what the Ageing view shows for finished product against the product quantity actually on the packaging issues.
-- Scratch database only. Three approved batches were given a QC record with an expiry date to make them appear.
select a.batch_label, a.remaining_qty as ageing_shows, f.batch_yield, f.packaged_qty as packs_counted,
       (select coalesce(sum(fp_qty_consumed),0) from packaging_issues p where p.finished_product_batch_id = f.id) as product_issued,
       greatest(f.batch_yield - coalesce(f.qc_sample_qty,0) - coalesce(f.stability_qty,0) - coalesce(f.rnd_qty,0)
                - (select coalesce(sum(fp_qty_consumed),0) from packaging_issues p where p.finished_product_batch_id = f.id), 0) as true_left
  from batch_ageing a join finished_product_batches f on f.id = a.batch_id where a.kind = 'fp' order by 1;

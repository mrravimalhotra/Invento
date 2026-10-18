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

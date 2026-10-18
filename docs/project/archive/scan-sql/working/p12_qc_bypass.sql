\pset footer off
reset role;
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','RM-T0001-03/26',50,'kg',0,0,0);
set role authenticated;
\echo === G: inventory_manager (no QC role) releases a fresh batch e3 with no QC at all
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('G1 insert an APPROVED QC row directly', $q$insert into quality_checks (ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status,reviewed_by,reviewed_at,retest_period_days,expiry_date) values ('AR-FAKE','00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3',0,'kg','approved','00000000-0000-0000-0000-0000000000a5',now(),180,current_date+365)$q$);
select 'G result: batch qc status = ' || coalesce(qc_status,'none') from purchase_batch_status where purchase_line_id='00000000-0000-0000-0000-0000000000e3';

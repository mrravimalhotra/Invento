\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values
 ('00000000-0000-0000-0000-00000000d411','PO-Q1','00000000-0000-0000-0000-0000000000c2','INV-Q1',current_date);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values
 ('00000000-0000-0000-0000-00000000e411','00000000-0000-0000-0000-00000000d411','00000000-0000-0000-0000-0000000000c3','Q1-B1',100,'kg',1,1,0,10,5),
 ('00000000-0000-0000-0000-00000000e412','00000000-0000-0000-0000-00000000d411','00000000-0000-0000-0000-0000000000c3','Q1-B2',100,'kg',1,1,0,10,5),
 ('00000000-0000-0000-0000-00000000e413','00000000-0000-0000-0000-00000000d411','00000000-0000-0000-0000-0000000000c3','Q1-B3',100,'kg',1,1,0,10,5);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('submit PO', $q$select submit_purchase_order('00000000-0000-0000-0000-00000000d411')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
\echo === A: QC record with sample 9999 'bogus' (batch has 1 kg sample)
select t_ok('A insert QC sample_qty 9999 unit bogus', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-00000000f411','AR-Q1','00000000-0000-0000-0000-00000000e411','00000000-0000-0000-0000-0000000000c3',9999,'bogus')$q$);
select t_ok('A2 insert QC (B2) normal', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-00000000f412','AR-Q2','00000000-0000-0000-0000-00000000e412','00000000-0000-0000-0000-0000000000c3',1,'kg')$q$);
select t_ok('A3 insert QC (B3) normal', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-00000000f413','AR-Q3','00000000-0000-0000-0000-00000000e413','00000000-0000-0000-0000-0000000000c3',1,'kg')$q$);
\echo === B: Round 1 REJECT with no comment (B2) 
select t_ok('B round 1 reject, no comment', $q$update quality_checks set status='rejected', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-00000000f412'$q$);
\echo === C: Round 1 approve then Round 2 REJECT with no comment (B3)
select t_ok('C1 round 1 approve (B3)', $q$update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-00000000f413'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('C2 round 2 reject, no comment', $q$update quality_checks set status='rejected', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now() where id='00000000-0000-0000-0000-00000000f413'$q$);
\echo === D: Round 1 approve (B1) then Round 2 approve with retest 400 days and NO expiry date
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('D1 round 1 approve (B1)', $q$update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-00000000f411'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('D2 round 2 approve: retest 400 days, no expiry', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=400 where id='00000000-0000-0000-0000-00000000f411'$q$);
reset role;
select 'QC rows: ' || string_agg(ar_number||':'||status||' retest='||coalesce(retest_date::text,'-')||' expiry='||coalesce(expiry_date::text,'-')||' sample='||coalesce(sample_qty::text,'-')||coalesce(sample_unit,''), '; ') from quality_checks where ar_number like 'AR-Q%';
select 'batch status: ' || string_agg(pl.batch_number||'='||s.qc_status, ', ') from purchase_batch_status s join purchase_lines pl on pl.id=s.purchase_line_id where pl.batch_number like 'Q1-%';
rollback;

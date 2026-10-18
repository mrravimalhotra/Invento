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

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

-- Session B: adds a second line to the same purchase order while A is still open
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values
 ('00000000-0000-0000-0000-00000000c102','00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-0000000000c3','RM-T0001-C2',50,'kg',1,0,0,10,5) returning 'B insert accepted';
commit;

\set ON_ERROR_STOP on
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'PASS  | ok      | %', p_label;
exception when others then raise notice 'FAIL  | ok      | % -> %', p_label, sqlerrm; end $$;
create or replace function public.t_fail(p_label text, p_sql text, p_expect text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'FAIL  | blocked | % -> statement was ALLOWED', p_label;
exception when others then
  if position(p_expect in sqlerrm) > 0 then raise notice 'PASS  | blocked | % -> %', p_label, sqlerrm;
  else raise notice 'FAIL  | blocked | % -> wrong error: %', p_label, sqlerrm; end if; end $$;
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to authenticated;

insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Green Farms');
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000d1','RM-T0001','Ashwa Root','raw','kg','00000000-0000-0000-0000-0000000000c1');
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000d9','PM-T0001','Label','packaging','nos','00000000-0000-0000-0000-0000000000c1');
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000e0','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);

\echo '===== SCAN-P10-05: quantity limits follow the unit'
select t_check('qty_limit kg is 1,000,000', public.qty_limit('kg') = 1000000);
select t_check('qty_limit is the same tonnage in g, mg, ltr and ml', public.qty_limit('g') = 1000000000 and public.qty_limit('mg') = 1000000000000 and public.qty_limit('ltr') = 1000000 and public.qty_limit('ml') = 1000000000);
select t_check('qty_limit nos, bottle, pack, unknown and null are 100,000,000', public.qty_limit('nos') = 100000000 and public.qty_limit('bottle') = 100000000 and public.qty_limit('pack') = 100000000 and public.qty_limit('x') = 100000000 and public.qty_limit(null) = 100000000);
select t_check('qty_limit ignores case and spaces ("KG ")', public.qty_limit('KG ') = 1000000);

select t_ok('a 30,000 kg truckload is accepted', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B1',30000,'kg',0,0,0,500,5)$q$);
select t_ok('1,000,000 kg (the limit itself) is accepted', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B2',1000000,'kg',0,0,0,500,5)$q$);
select t_fail('1,000,001 kg is refused', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B3',1000001,'kg',0,0,0,500,5)$q$, 'purchase_lines_quantity_limit');
select t_ok('5,000,000 g (5 tonnes typed in grams) is accepted', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B4',5000000,'g',0,0,0,0.5,5)$q$);
select t_ok('2,000,000,000 mg (2 tonnes typed in mg) is accepted', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B5',2000000000,'mg',0,0,0,0.001,5)$q$);
select t_ok('3,000,000 nos (capsules or labels) is accepted', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d9','B6',3000000,'nos',0,0,0,1,5)$q$);
select t_fail('1e30 kg is refused', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B7',1e30,'kg',0,0,0,500,5)$q$, 'purchase_lines_quantity_limit');
select t_fail('1,000,000,000 nos is refused', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d9','B8',1000000000,'nos',0,0,0,1,5)$q$, 'purchase_lines_quantity_limit');
select t_fail('a quantity of infinity is refused', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B9','Infinity','kg',0,0,0,500,5)$q$, 'purchase_lines_quantity_limit');
select t_ok('a saffron price of 400,000 per kg is accepted', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B10',2,'kg',0,0,0,400000,5)$q$);
select t_fail('a unit price of 1e20 is refused', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B11',2,'kg',0,0,0,1e20,5)$q$, 'purchase_lines_unit_price_limit');
select t_fail('editing a saved line to 1e30 kg is refused', $q$update purchase_lines set quantity = 1e30 where batch_number = 'B1'$q$, 'purchase_lines_quantity_limit');
select t_ok('a normal edit of a saved line is fine', $q$update purchase_lines set quantity = 31000 where batch_number = 'B1'$q$);

\echo '===== SCAN-P10-05: MFR and batch size'
select t_ok('an MFR batch of 500 kg is accepted', $q$insert into mfr_definitions (code, name, batch_size_qty, batch_size_unit) values ('MFR-T1','Real MFR',500,'kg')$q$);
select t_fail('an MFR batch of 1e12 kg is refused', $q$insert into mfr_definitions (code, name, batch_size_qty, batch_size_unit) values ('MFR-T2','Huge MFR',1e12,'kg')$q$, 'mfr_definitions_batch_size_qty_limit');
select t_ok('an MFR line of 120 kg is accepted', $q$insert into mfr_lines (mfr_definition_id, item_id, quantity, unit) select id, '00000000-0000-0000-0000-0000000000d1', 120, 'kg' from mfr_definitions where code = 'MFR-T1'$q$);
select t_fail('an MFR line of 1e12 kg is refused', $q$insert into mfr_lines (mfr_definition_id, item_id, quantity, unit) select id, '00000000-0000-0000-0000-0000000000d1', 1e12, 'kg' from mfr_definitions where code = 'MFR-T1'$q$, 'mfr_lines_quantity_limit');

\echo '===== SCAN-P10-05: text lengths'
select t_ok('an item name of 200 characters is accepted', $q$insert into items (item_code,name,category,unit,item_type_id) values ('RM-T0002', repeat('a',200),'raw','kg','00000000-0000-0000-0000-0000000000c1')$q$);
select t_fail('an item name of 201 characters is refused', $q$insert into items (item_code,name,category,unit,item_type_id) values ('RM-T0003', repeat('b',201),'raw','kg','00000000-0000-0000-0000-0000000000c1')$q$, 'items_name_limit');
select t_fail('a vendor name of 5,000,000 characters is refused', $q$insert into vendors (vendor_code,name) values ('V-T2', repeat('c',5000000))$q$, 'vendors_name_limit');
select t_fail('a vendor address of 501 characters is refused', $q$insert into vendors (vendor_code,name,address) values ('V-T3','Short Name', repeat('d',501))$q$, 'vendors_address_limit');
select t_ok('a vendor address of 500 characters is accepted', $q$insert into vendors (vendor_code,name,address) values ('V-T4','Other Name', repeat('d',500))$q$);
select t_fail('an item type of 201 characters is refused', $q$insert into item_types (description) values (repeat('e',201))$q$, 'item_types_description_limit');
select t_fail('an equipment name of 201 characters is refused', $q$insert into equipment (equipment_code,name) values ('EQ-T1', repeat('f',201))$q$, 'equipment_name_limit');
select t_ok('an equipment name of 80 characters is accepted', $q$insert into equipment (equipment_code,name) values ('EQ-T2', repeat('f',80))$q$);

\echo '===== SCAN-P10-05: the migration stops if stored rows are already above a limit'
select t_check('all 20 limit constraints exist and are not yet validated (new and changed rows only)', (select count(*) from pg_constraint where conname like '%\_limit' and connamespace = 'public'::regnamespace and not convalidated) = 20);

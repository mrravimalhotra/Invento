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
create or replace function public.t_onhand(p uuid) returns numeric language sql security definer as $$ select coalesce((select on_hand from stock_balance where item_id=p),0) $$;
grant execute on function public.t_onhand(uuid) to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),('00000000-0000-0000-0000-0000000000a3','mfr@t'),('00000000-0000-0000-0000-0000000000a4','qcc@t'),('00000000-0000-0000-0000-0000000000a5','qcr@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),('00000000-0000-0000-0000-0000000000a3','mfr_manager'),('00000000-0000-0000-0000-0000000000a4','quality_checker'),('00000000-0000-0000-0000-0000000000a5','qc_reviewer');
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Ashwagandha','raw','kg','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c4','RM-T0002','Oil base','raw','ltr','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c5','PK-T0001','Jar','packaging','nos','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c6','RM-T0003','No-unit item','raw',null,'00000000-0000-0000-0000-0000000000c1');

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
\echo '===== 1. purchase lines'
select t_ok('PO with 10 kg line + 500 g line (qc 10 g already in line unit) + 250 ml of a ltr item + 100 nos jars', $q$
 insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
 insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B-KG',10,'kg',0.1,0,0,400,5),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B-G',500,'g',10,0,0,0.5,5),
  ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c4','B-ML',250,'ml',0,0,0,2,0),
  ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c5','B-JAR',100,'nos',0,0,0,3,0)$q$);
select t_check('500 g line saved as 0.5 kg, QC 10 g as 0.01 kg, price ₹0.50/g as ₹500/kg (value unchanged ₹250)',
  (select quantity=0.5 and unit='kg' and qc_qty=0.01 and unit_price=500 and quantity*unit_price=250 and live_remaining_qty=0.49 from purchase_lines where id='00000000-0000-0000-0000-0000000000e2'));
select t_check('250 ml of a ltr item saved as 0.25 ltr', (select quantity=0.25 and unit='ltr' from purchase_lines where id='00000000-0000-0000-0000-0000000000e3'));
select t_check('stored numbers have no trailing zeros', (select quantity::text='0.5' and unit_price::text='500' from purchase_lines where id='00000000-0000-0000-0000-0000000000e2'));
select t_fail('line in "nos" for a kg item is refused', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B-X',5,'nos',0,0,0)$q$, 'kept in stock in "kg"');
select t_fail('line in "ltr" for a kg item is refused', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B-Y',5,'ltr',0,0,0)$q$, 'kept in stock in "kg"');
select t_fail('changing an existing line''s unit is refused', $q$update purchase_lines set quantity=750, unit='g' where id='00000000-0000-0000-0000-0000000000e2'$q$, 'can''t be changed');
select t_ok('editing the draft line quantity to 0.75 kg (same unit)', $q$update purchase_lines set quantity=0.75 where id='00000000-0000-0000-0000-0000000000e2'$q$);
select t_check('edit converted: 0.75 kg, live remaining 0.74', (select quantity=0.75 and unit='kg' and live_remaining_qty=0.74 from purchase_lines where id='00000000-0000-0000-0000-0000000000e2'));
select t_ok('Final Submit', $q$select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('Ashwagandha on hand = 9.9 + 0.74 = 10.64 kg (was 749.9 before the fix)', t_onhand('00000000-0000-0000-0000-0000000000c3') = 10.64);
select t_check('every ledger row for the kg item is in kg', not exists (select 1 from inventory_ledger where item_id='00000000-0000-0000-0000-0000000000c3' and unit is distinct from 'kg'));
select t_check('running balance ends at 10.64', (select running_balance from inventory_ledger_with_balance where item_id='00000000-0000-0000-0000-0000000000c3' order by event_at desc, seq desc limit 1) = 10.64);

\echo '===== 2. item with no unit adopts first unit; unit lock'
select t_ok('purchase line for the item with no unit, in g', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d2','PO-T2','00000000-0000-0000-0000-0000000000c2','INV-2',current_date); insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c6','B-NU',200,'g',0,0,0)$q$);
select t_check('item adopted "g" as its stock unit', (select unit='g' from items where id='00000000-0000-0000-0000-0000000000c6'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('admin cannot change unit of a used item (kg → g)', $q$update items set unit='g' where id='00000000-0000-0000-0000-0000000000c3'$q$, 'can''t be changed');
select t_ok('admin can change unit of an unused item', $q$insert into items (id,item_code,name,category,unit) values ('00000000-0000-0000-0000-0000000000c7','RM-T0004','Unused','raw','kg'); update items set unit='g' where id='00000000-0000-0000-0000-0000000000c7'$q$);
select t_ok('other item edits still work on a used item', $q$update items set name='Ashwagandha root' where id='00000000-0000-0000-0000-0000000000c3'$q$);

\echo '===== 3. QC approve the batches'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC round 1 on B-KG and B-G', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0.1,'kg'),('00000000-0000-0000-0000-0000000000f2',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',0.01,'kg'); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id in ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC round 2 approve', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id in ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2')$q$);

\echo '===== 4. MFR recipe line in g for a kg item; FP target in g for a kg MFR'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('create MFR (batch 100 kg) with recipe line 500 g Ashwagandha, approve', $q$select create_mfr_definition('Test MFR', 100, 'kg', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":500,"unit":"g"}]'::jsonb, 'domestic'); select approve_mfr_definition((select id from mfr_definitions where name='Test MFR'))$q$);
select t_check('recipe line stored as 0.5 kg', (select quantity=0.5 and unit='kg' from mfr_lines where mfr_definition_id=(select id from mfr_definitions where name='Test MFR')));
select t_fail('recipe line in "nos" for a kg item refused', $q$select create_mfr_definition('Bad MFR', 100, 'kg', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"nos"}]'::jsonb, 'domestic')$q$, 'kept in stock in "kg"');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('FP batch with target 50,000 g', $q$insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date) select '00000000-0000-0000-0000-0000000000b1', b.batch_number, b.short_batch_no, m.id, 1, 50000, 'g', current_date from (select id from mfr_definitions where name='Test MFR') m, get_next_fp_batch_number(m.id) b$q$);
select t_check('FP batch saved as 50 kg (MFR batch-size unit)', (select target_qty=50 and unit='kg' from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1'));
select t_fail('FP batch target in ltr for a kg MFR refused', $q$insert into finished_product_batches (batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date) select b.batch_number, b.short_batch_no, m.id, 1, 5, 'ltr', current_date from (select id from mfr_definitions where name='Test MFR') m, get_next_fp_batch_number(m.id) b$q$, 'can''t be used');
select t_ok('component: scaled 0.5 kg × 0.5 = 0.25 kg from B-KG', $q$insert into finished_product_components (finished_product_batch_id,item_id,purchase_line_id,quantity) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',0.25)$q$);
select t_check('component ledger pull labelled kg (was blank)', exists (select 1 from inventory_ledger where reference_type='finished_product' and reference_id='00000000-0000-0000-0000-0000000000b1' and unit='kg' and quantity=0.25));
select t_check('Ashwagandha on hand 10.64 − 0.25 = 10.39 kg', t_onhand('00000000-0000-0000-0000-0000000000c3') = 10.39);
select t_fail('cannot change an FP batch unit afterwards', $q$update finished_product_batches set unit='g' where id='00000000-0000-0000-0000-0000000000b1'$q$, 'can''t be changed');

\echo '===== 5. ledger safety net (SQL editor / any writer)'
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
select t_ok('direct ledger push of 100 g for the kg item', $q$insert into inventory_ledger (event_type,item_id,quantity,unit,reason) values ('push','00000000-0000-0000-0000-0000000000c3',100,'g','test')$q$);
select t_check('stored as 0.1 kg; on hand 10.49', t_onhand('00000000-0000-0000-0000-0000000000c3') = 10.49 and exists (select 1 from inventory_ledger where reason='test' and quantity=0.1 and unit='kg'));
select t_fail('direct ledger push in nos for a kg item refused', $q$insert into inventory_ledger (event_type,item_id,quantity,unit) values ('push','00000000-0000-0000-0000-0000000000c3',1,'nos')$q$, 'kept in stock in "kg"');

\echo '===== 6. packaging material line in a converted unit'
select t_check('packaging_issue_items conversion trigger exists', exists (select 1 from pg_trigger where tgname='trg_00_unit_packaging_item'));
select t_check('no row anywhere stored in a unit different from its item',
  not exists (select 1 from inventory_ledger l join items i on i.id=l.item_id where l.unit <> i.unit)
  and not exists (select 1 from purchase_lines p join items i on i.id=p.item_id where p.unit <> i.unit)
  and not exists (select 1 from mfr_lines m join items i on i.id=m.item_id where m.unit <> i.unit));
select t_check('coverage report still empty', not exists (select 1 from audit_coverage_report()));

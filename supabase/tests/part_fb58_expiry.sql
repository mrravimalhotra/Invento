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
create or replace function public.t_oh(p uuid) returns numeric language sql security definer as $$ select coalesce((select on_hand from stock_balance where item_id=p),0) $$;
grant execute on function public.t_oh(uuid) to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),('00000000-0000-0000-0000-0000000000a3','mfr@t'),('00000000-0000-0000-0000-0000000000a4','qcc@t'),('00000000-0000-0000-0000-0000000000a5','qcr@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),('00000000-0000-0000-0000-0000000000a3','mfr_manager'),('00000000-0000-0000-0000-0000000000a4','quality_checker'),('00000000-0000-0000-0000-0000000000a5','qc_reviewer');
-- B16 (0090): oldest stock first is a hard rule for finished-product batches.
-- Users: a1 admin, a2 inventory manager (composes), a3 MFR manager, a4 QC checker, a5 QC reviewer.
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c4','RM-T0002','Raw B','raw','kg','00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== three batches of Raw A: O (oldest), M, N (newest), all submitted'
select t_ok('PO1 batch O 10 kg', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','O',10,'kg',0.1,0.1,0.1); select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_ok('PO2 batch M 10 kg', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d2','PO-T2','00000000-0000-0000-0000-0000000000c2','INV-2',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','M',10,'kg',0.1,0.1,0.1); select submit_purchase_order('00000000-0000-0000-0000-0000000000d2')$q$);
select t_ok('PO3 batch N 10 kg', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d3','PO-T3','00000000-0000-0000-0000-0000000000c2','INV-3',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000c3','N',10,'kg',0.1,0.1,0.1); select submit_purchase_order('00000000-0000-0000-0000-0000000000d3')$q$);
reset role;
update purchase_lines set created_at = now() - interval '3 days' where id='00000000-0000-0000-0000-0000000000e1';
update purchase_lines set created_at = now() - interval '2 days' where id='00000000-0000-0000-0000-0000000000e2';
update purchase_lines set created_at = now() - interval '1 day'  where id='00000000-0000-0000-0000-0000000000e3';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);

\echo '===== approve M and N only (O stays un-reviewed)'
select t_ok('QC M + N round 1', $q$
  insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f2',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',0.1,'kg'),('00000000-0000-0000-0000-0000000000f3',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3',0.1,'kg');
  update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id in ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f3')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC M + N approved', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id in ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f3')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('MFR approved (2 kg Raw A)', $q$select create_mfr_definition('Test MFR', 10, 'kg', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic'); select approve_mfr_definition((select id from mfr_definitions where name='Test MFR'))$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

reset role;
-- helper to start a draft FP batch
create or replace function public.t_fp(p_id uuid) returns void language sql security invoker as $$
  insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date)
  select p_id, b.batch_number, b.short_batch_no, m.id, 1, 10, 'kg', current_date
  from (select id from mfr_definitions where name='Test MFR') m, get_next_fp_batch_number(m.id) b $$;
grant execute on function public.t_fp(uuid) to authenticated;
create or replace function public.t_comp(p_fp uuid, p_line uuid, p_qty numeric) returns void language sql security invoker as $$
  insert into finished_product_components (finished_product_batch_id,item_id,purchase_line_id,quantity)
  values (p_fp,'00000000-0000-0000-0000-0000000000c3',p_line,p_qty) $$;
grant execute on function public.t_comp(uuid,uuid,numeric) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

-- FB-0058 / FB-0061 (0098): a batch past its expiry date cannot be used and does not
-- count as "older stock" in the FIFO check; a batch with no retest date (final retest)
-- stays usable until it expires. M (e2) and N (e3) are approved with retest period 365.

\echo '===== the status view carries the expiry date'
reset role;
update quality_checks set expiry_date = current_date + 30 where purchase_line_id = '00000000-0000-0000-0000-0000000000e2';
update quality_checks set expiry_date = current_date + 60 where purchase_line_id = '00000000-0000-0000-0000-0000000000e3';
select t_check('purchase_batch_status shows M expiry', (select expiry_date from purchase_batch_status where purchase_line_id='00000000-0000-0000-0000-0000000000e2') = current_date + 30);

\echo '===== final retest: no retest period/date, usable until expiry'
update quality_checks set retest_period_days = null, retest_date = null where purchase_line_id = '00000000-0000-0000-0000-0000000000e2';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('start draft 1', $q$select t_fp('00000000-0000-0000-0000-0000000000b1')$q$);
select t_ok('M (no retest date, expiry in 30 days) may be used', $q$select t_comp('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e2',2)$q$);
select t_fail('N refused while M (older) has stock', $q$select t_comp('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e3',2)$q$, 'Oldest stock must be used first');

\echo '===== M expires: it cannot be used and no longer holds N back'
reset role;
update quality_checks set expiry_date = current_date - 1 where purchase_line_id = '00000000-0000-0000-0000-0000000000e2';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('start draft 2', $q$select t_fp('00000000-0000-0000-0000-0000000000b2')$q$);
select t_fail('M refused after its expiry date', $q$select t_comp('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000e2',1)$q$, 'expired on');
select t_ok('N may now be used (expired M does not come first)', $q$select t_comp('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000e3',2)$q$);

\echo '===== expiry today is still usable'
reset role;
update quality_checks set expiry_date = current_date where purchase_line_id = '00000000-0000-0000-0000-0000000000e3';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('N with expiry today may be used', $q$select t_comp('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000e3',1)$q$);

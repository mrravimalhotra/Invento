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
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c4','LEG-RM-01967','Legacy B','raw','kg','00000000-0000-0000-0000-0000000000c1');
create or replace function public.t_addline(p_item uuid, p_qty numeric, p_stab numeric) returns text language plpgsql as $$
declare v text; begin v := get_next_batch_number(p_item);
insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000d1',p_item,v,p_qty,'kg',0.5,p_stab,0); return v; end $$;
grant execute on function public.t_addline(uuid,numeric,numeric) to authenticated;
create or replace function public.t_approve(p_batch text) returns void language plpgsql as $$
declare v_line uuid; v_qc uuid := gen_random_uuid(); begin
 select id into v_line from purchase_lines where batch_number = p_batch;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
 insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values (v_qc,get_next_ar_number(),v_line,'00000000-0000-0000-0000-0000000000c3',0.5,'kg');
 update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id=v_qc;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
 update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=0 where id=v_qc;
end $$;
grant execute on function public.t_approve(text) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
\echo '===== ACC-09: batch numbers after a deletion'
select t_ok('three lines for RM-T0001 and three for LEG-RM-01967', $q$select t_addline('00000000-0000-0000-0000-0000000000c3',10,0); select t_addline('00000000-0000-0000-0000-0000000000c3',10,5); select t_addline('00000000-0000-0000-0000-0000000000c3',10,0); select t_addline('00000000-0000-0000-0000-0000000000c4',10,0); select t_addline('00000000-0000-0000-0000-0000000000c4',10,0); select t_addline('00000000-0000-0000-0000-0000000000c4',10,0)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('admin deletes draft line 02 of each item', $q$delete from purchase_lines where batch_number in ('RM-T0001-02/'||to_char(now(),'YY'), 'LEG-RM-01967-02/'||to_char(now(),'YY'))$q$);
select t_check('next RM-T0001 number is 04 (count+1 gave 03 again)', get_next_batch_number('00000000-0000-0000-0000-0000000000c3') = 'RM-T0001-04/'||to_char(now(),'YY'));
select t_check('next LEG-RM-01967 number is 04 (count+1 gave a silent duplicate 03)', get_next_batch_number('00000000-0000-0000-0000-0000000000c4') = 'LEG-RM-01967-04/'||to_char(now(),'YY'));
select t_fail('a duplicate LEG- batch number is refused', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c4','LEG-RM-01967-03/'||to_char(now(),'YY'),1,'kg',0,0,0)$q$, 'already used for this item');
select t_check('a number beyond 99 keeps counting', _max_batch_seq(array['X-99/26','X-100/26','X-7/25','Y-500/26'], 'X-', '/26') = 100);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_check('new line gets 04 with a 5 kg stability reserve', t_addline('00000000-0000-0000-0000-0000000000c3',10,5) = 'RM-T0001-04/'||to_char(now(),'YY'));
select t_ok('Final Submit', $q$select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);

\echo '===== approve both RM-T0001 batches, retest period 0 (due today)'
select t_ok('approve RM-T0001-01 (no stability reserve) and -04 (5 kg reserve), retest due today', $q$select t_approve('RM-T0001-01/'||to_char(now(),'YY')); select t_approve('RM-T0001-04/'||to_char(now(),'YY'))$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_check('both listed as due in purchase_line_qc (stability 0 was hidden before)', (select count(*) from purchase_line_qc where qc_status='approved' and retest_date <= current_date and live_remaining_qty > 0 and item_code='RM-T0001') = 2);
select t_check('reserve left shown: -01 = 0, -04 = 5', (select string_agg(stability_reserve_left::text, ',' order by batch_number) from purchase_line_qc where item_code='RM-T0001' and qc_status='approved') = '0,5');

\echo '===== ACC-10: batch with no stability reserve can now be retested (from stock)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('incompatible sample unit refused', $q$select start_retest((select id from purchase_lines where batch_number='RM-T0001-01/'||to_char(now(),'YY')), null, 1, 'nos')$q$, 'can''t be used');
select t_ok('retest -01 with a 0.5 kg sample', $q$select start_retest((select id from purchase_lines where batch_number='RM-T0001-01/'||to_char(now(),'YY')), null, 0.5, 'kg')$q$);
select t_check('-01: 0.5 kg from stock, 0 from reserve; live remaining 9.5 → 9.0; ledger pull recorded', (select live_remaining_qty from purchase_lines where batch_number='RM-T0001-01/'||to_char(now(),'YY')) = 9.0
  and (select stability_reserve_used = 0 and stock_sample_used = 0.5 and is_retest from quality_checks q join purchase_lines pl on pl.id=q.purchase_line_id where pl.batch_number='RM-T0001-01/'||to_char(now(),'YY') and q.is_retest)
  and exists (select 1 from inventory_ledger il join purchase_lines pl on pl.id=il.purchase_line_id where pl.batch_number='RM-T0001-01/'||to_char(now(),'YY') and il.reason='Retest sample' and il.quantity=0.5));

\echo '===== ACC-16: retests use up the stability reserve'
select t_ok('retest -04 with 2000 g (2 kg)', $q$select start_retest((select id from purchase_lines where batch_number='RM-T0001-04/'||to_char(now(),'YY')), null, 2000, 'g')$q$);
select t_check('-04: 2 kg from reserve, stock untouched (4.5), reserve left 3', (select live_remaining_qty from purchase_lines where batch_number='RM-T0001-04/'||to_char(now(),'YY')) = 4.5
  and (select stability_reserve_left from purchase_line_qc where batch_number='RM-T0001-04/'||to_char(now(),'YY')) = 3);
select t_fail('a second retest while one is open is refused', $q$select start_retest((select id from purchase_lines where batch_number='RM-T0001-04/'||to_char(now(),'YY')), null, 1, 'kg')$q$, 'not due for retest');
-- approve that retest (period 0 → due again)
select t_ok('approve the retest of -04 (due again today)', $q$select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',true); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where is_retest and purchase_line_id=(select id from purchase_lines where batch_number='RM-T0001-04/'||to_char(now(),'YY')) and status='submitted'; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',true); update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=0 where is_retest and purchase_line_id=(select id from purchase_lines where batch_number='RM-T0001-04/'||to_char(now(),'YY')) and status='checker_approved'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('retest needing more than reserve + stock is refused', $q$select start_retest((select id from purchase_lines where batch_number='RM-T0001-04/'||to_char(now(),'YY')), null, 9, 'kg')$q$, 'not enough for a 9 kg sample');
select t_ok('retest -04 with 4 kg (3 reserve + 1 stock)', $q$select start_retest((select id from purchase_lines where batch_number='RM-T0001-04/'||to_char(now(),'YY')), null, 4, 'kg')$q$);
select t_check('-04: reserve used up (0 left), stock 4.5 → 3.5', (select stability_reserve_left from purchase_line_qc where batch_number='RM-T0001-04/'||to_char(now(),'YY')) = 0 and (select live_remaining_qty from purchase_lines where batch_number='RM-T0001-04/'||to_char(now(),'YY')) = 3.5);
select t_check('item stock matches batches: ledger on hand = sum of batch remaining', t_oh('00000000-0000-0000-0000-0000000000c3') = (select sum(live_remaining_qty) from purchase_lines where item_id='00000000-0000-0000-0000-0000000000c3'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_fail('MFR manager cannot start a retest', $q$select start_retest((select id from purchase_lines where batch_number='RM-T0001-03/'||to_char(now(),'YY')), null, 1, 'kg')$q$, 'Not authorized');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('a batch not approved is not due', $q$select start_retest((select id from purchase_lines where batch_number='RM-T0001-03/'||to_char(now(),'YY')), null, 1, 'kg')$q$, 'not due for retest');
reset role;
select t_check('coverage report still empty', not exists (select 1 from audit_coverage_report()));

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
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1');

create or replace function public.t_pos(p uuid) returns text language sql security definer as $$
  select format('%s|%s|%s|%s', coalesce(on_hand,0), coalesce(rejected,0), coalesce(wastage,0), coalesce(received - held_qc - held_stability - held_rnd - consumed_by_fp - wastage - rejected - on_hand, 0))
    from item_position where item_id = p $$;
grant execute on function public.t_pos(uuid) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);


\echo '===== reject moves the batch out of On hand'
select t_ok('PO: 100 kg line, samples 1/2/3 kg, submit', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',100,'kg',1,2,3); select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('on hand 94 before QC', t_oh('00000000-0000-0000-0000-0000000000c3') = 94);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC round 1', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',1,'kg'); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select t_check('still 94 while QC is open', t_oh('00000000-0000-0000-0000-0000000000c3') = 94);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC round 2 rejects', $q$update quality_checks set status='rejected', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select t_check('on hand 0 after rejection', t_oh('00000000-0000-0000-0000-0000000000c3') = 0);
select t_check('Stock Position: on hand 0, rejected 94, breakdown reconciles', t_pos('00000000-0000-0000-0000-0000000000c3') = '0|94|0|0');
select t_check('one qc_rejected pull of 94 in the ledger', (select count(*) = 1 and sum(quantity) = 94 and min(event_type) = 'pull' from inventory_ledger where purchase_line_id='00000000-0000-0000-0000-0000000000e1' and reference_type='qc_rejected'));
select t_check('batch stays whole: live remaining 94', (select live_remaining_qty from purchase_lines where id='00000000-0000-0000-0000-0000000000e1') = 94);
select t_check('Rejected list: 94 kg, samples 1/2/3, AR kept', (select rejected_qty = 94 and received_qty = 100 and qc_qty = 1 and stability_qty = 2 and rnd_qty = 3 and ar_number is not null and source = 'purchase' from rejected_batches where batch_id='00000000-0000-0000-0000-0000000000e1'));

\echo '===== reopen refused, wastage on a rejected batch'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('PO reopen refused: batch rejected', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$, 'was rejected by QC');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('write off 4 kg of the rejected batch', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',4,'kg','expired disposal')$q$);
select t_check('on hand still 0, wastage 4, rejected 90, reconciles', t_pos('00000000-0000-0000-0000-0000000000c3') = '0|90|4|0');
select t_check('Rejected list shows 90', (select rejected_qty from rejected_batches where batch_id='00000000-0000-0000-0000-0000000000e1') = 90);
select t_check('live remaining 90', (select live_remaining_qty from purchase_lines where id='00000000-0000-0000-0000-0000000000e1') = 90);

\echo '===== an approved batch is untouched'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('PO 2: 50 kg no samples, submit', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d2','PO-T2','00000000-0000-0000-0000-0000000000c2','INV-2',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','B2',50,'kg',0,0,0); select submit_purchase_order('00000000-0000-0000-0000-0000000000d2')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC round 1 (B2)', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f2',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',0,'kg'); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f2'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC round 2 approves (B2)', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f2'$q$);
select t_check('B2 stays in stock: on hand 50, no qc_rejected row, not in Rejected list',
  t_oh('00000000-0000-0000-0000-0000000000c3') = 50
  and not exists (select 1 from inventory_ledger where purchase_line_id='00000000-0000-0000-0000-0000000000e2' and reference_type='qc_rejected')
  and not exists (select 1 from rejected_batches where batch_id='00000000-0000-0000-0000-0000000000e2'));

\echo '===== rejected batch later approved gives the stock back'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('PO 3: 20 kg, submit', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d3','PO-T3','00000000-0000-0000-0000-0000000000c2','INV-3',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000c3','B3',20,'kg',0,0,0); select submit_purchase_order('00000000-0000-0000-0000-0000000000d3')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC round 1 (B3)', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f3',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3',0,'kg'); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f3'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('reject B3', $q$update quality_checks set status='rejected', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now() where id='00000000-0000-0000-0000-0000000000f3'$q$);
select t_check('on hand 50 (B2 only), B3 20 rejected', t_oh('00000000-0000-0000-0000-0000000000c3') = 50 and (select rejected_qty from rejected_batches where batch_id='00000000-0000-0000-0000-0000000000e3') = 20);
reset role;
select t_ok('a later approval for B3 (set by the database owner)', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status,reviewed_at,retest_period_days,created_at) values ('00000000-0000-0000-0000-0000000000f4','AR-REAPPROVE','00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3',0,'kg','approved',now(),365, now() + interval '1 minute')$q$);
select t_check('B3 back in stock: on hand 70, no longer in Rejected list',
  (select on_hand from stock_balance where item_id='00000000-0000-0000-0000-0000000000c3') = 70
  and not exists (select 1 from rejected_batches where batch_id='00000000-0000-0000-0000-0000000000e3'));

\echo '===== backfill statement moves already-rejected batches'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('B4 rejected while the trigger is off (as before this migration)', $q$
  alter table quality_checks disable trigger trg_qc_rejected_stock;
  insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d4','PO-T4','00000000-0000-0000-0000-0000000000c2','INV-4',current_date);
  insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000c3','B4',30,'kg',0,0,0);
  select submit_purchase_order('00000000-0000-0000-0000-0000000000d4');
  insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status,reviewed_at) values ('00000000-0000-0000-0000-0000000000f5','AR-OLD-REJ','00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000c3',0,'kg','rejected',now());
  alter table quality_checks enable trigger trg_qc_rejected_stock$q$);
select t_check('B4 still counted in stock before the backfill (100)', t_oh('00000000-0000-0000-0000-0000000000c3') = 100);
select t_ok('backfill statement', $q$insert into public.inventory_ledger (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id)
  select 'pull', pl.item_id, pl.id, pl.live_remaining_qty, pl.unit, 'qc_rejected', pl.id
    from public.purchase_lines pl
    join lateral (select x.status from public.quality_checks x where x.purchase_line_id = pl.id order by x.created_at desc, x.id desc limit 1) q on q.status = 'rejected'
   where pl.pushed_at is not null and pl.live_remaining_qty > 0
     and not exists (select 1 from public.inventory_ledger l where l.purchase_line_id = pl.id and l.reference_type = 'qc_rejected')$q$);
select t_check('B4 moved out: on hand 70; B1 (90, already moved) not moved twice', t_oh('00000000-0000-0000-0000-0000000000c3') = 70 and (select count(*) from inventory_ledger where purchase_line_id='00000000-0000-0000-0000-0000000000e1' and reference_type='qc_rejected' and event_type='pull') = 1);
select t_check('B4 listed with 30 rejected', (select rejected_qty from rejected_batches where batch_id='00000000-0000-0000-0000-0000000000e4') = 30);

\echo '===== function text: every UPDATE/DELETE has a WHERE (hosted database refuses otherwise)'
select t_check('record_wastage handles qc_rejected', (select prosrc ilike '%qc_rejected%' from pg_proc where proname='record_wastage'));
select t_check('reopen_purchase_order checks rejected batches', (select prosrc ilike '%rejected by QC%' from pg_proc where proname='reopen_purchase_order'));
select t_check('undo_opening_load tolerates qc_rejected', (select prosrc ilike '%qc_rejected%' from pg_proc where proname='undo_opening_load'));

\echo '===== rejected opening stock: listed, and the load can still be undone'
create or replace function public.t_load(p_kind text, p_rows text) returns text language plpgsql as $$
declare r record; begin select * into r from public.load_opening_stock(p_kind, p_rows::jsonb); return r.load_no; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('IM loads one rejected opening batch (12 kg)', $q$select t_load('raw', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"OLD-REJ","quantity":12,"receipt_date":"2026-02-02","qc_status":"rejected","old_ar":"AR/2025/777","approval_date":"2026-02-05"}]')$q$);
select t_check('opening rejected batch: not in stock, listed as Legacy 12 kg', (select rejected_qty = 12 and is_legacy from rejected_batches where batch_number='OLD-REJ'));
select t_check('on hand unchanged by the opening rejected batch (70)', t_oh('00000000-0000-0000-0000-0000000000c3') = 70);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('admin undoes that load', $q$select undo_opening_load((select id from opening_loads order by created_at desc limit 1))$q$);
select t_check('batch and its rejected move are gone', not exists (select 1 from rejected_batches where batch_number='OLD-REJ') and t_oh('00000000-0000-0000-0000-0000000000c3') = 70);

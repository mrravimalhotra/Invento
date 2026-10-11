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
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
\echo '===== P3-01: an approved batch cannot be reopened or changed'
select t_ok('PO: 100 kg line, submitted', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',100,'kg',1,2,3,10,5); select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('before QC starts, the order can still be reopened and submitted again', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1'); select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC round 1', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',1,'kg')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('reopen refused as soon as QC has a record (round 1 under way)', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$, 'QC has started on batch B1');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC round 1 approved', $q$update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC round 2 approved', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365, expiry_date=current_date+400 where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('reopen refused for an approved batch', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$, 'Analytical Report No.');
select t_check('the order is still submitted and the stock unchanged (94)', (select status from purchase_orders where id='00000000-0000-0000-0000-0000000000d1') = 'submitted' and t_oh('00000000-0000-0000-0000-0000000000c3') = 94);

\echo '===== P3-01: a draft line that has a QC record keeps its item, batch number, unit, quantity and samples'
reset role;
select t_ok('a draft order with one line that already has a QC record (set up by the owner)', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d3','PO-T3','00000000-0000-0000-0000-0000000000c2','INV-3',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000c3','B3',20,'kg',1,1,1,10,5); insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f3',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3',1,'kg')$q$);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('quantity change refused', $q$update purchase_lines set quantity=10 where id='00000000-0000-0000-0000-0000000000e3'$q$, 'has a QC record');
select t_fail('batch number change refused', $q$update purchase_lines set batch_number='B3-X' where id='00000000-0000-0000-0000-0000000000e3'$q$, 'has a QC record');
select t_fail('item change refused', $q$update purchase_lines set item_id='00000000-0000-0000-0000-0000000000c5' where id='00000000-0000-0000-0000-0000000000e3'$q$, 'has a QC record');
select t_fail('unit change refused', $q$update purchase_lines set unit='g' where id='00000000-0000-0000-0000-0000000000e3'$q$, 'has a QC record');
select t_fail('sample quantity change refused', $q$update purchase_lines set qc_qty=2 where id='00000000-0000-0000-0000-0000000000e3'$q$, 'has a QC record');
select t_ok('price and GST % can still be edited', $q$update purchase_lines set unit_price=12, gst_pct=12 where id='00000000-0000-0000-0000-0000000000e3'$q$);
select t_check('the line is unchanged apart from price and GST', (select quantity=20 and batch_number='B3' and unit='kg' and qc_qty=1 and unit_price=12 and gst_pct=12 from purchase_lines where id='00000000-0000-0000-0000-0000000000e3'));
select t_ok('a line without a QC record is still freely editable', $q$insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000c3','B4',5,'kg',0,0,0,1,0); update purchase_lines set quantity=6, batch_number='B4-X' where id='00000000-0000-0000-0000-0000000000e4'$q$);

\echo '===== P4-03: expired material is not retested'
reset role;
select t_ok('the approved batch is past its retest date and its expiry', $q$update quality_checks set retest_date=current_date-5, expiry_date=current_date-2 where id='00000000-0000-0000-0000-0000000000f1'$q$);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('a retest on an expired batch is refused', $q$select start_retest('00000000-0000-0000-0000-0000000000e1', null, 0.5, 'kg')$q$, 'can''t be retested');
select t_check('no retest record was created', (select count(*) from quality_checks where purchase_line_id='00000000-0000-0000-0000-0000000000e1') = 1);
reset role;
select t_ok('the expiry is a future date and the retest date has passed (approved 400 days ago, 365-day period)', $q$update quality_checks set reviewed_at=now()-interval '400 days', retest_period_days=365, expiry_date=current_date+30 where id='00000000-0000-0000-0000-0000000000f1'$q$);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('a retest on a batch that is not expired starts normally', $q$select start_retest('00000000-0000-0000-0000-0000000000e1', null, 0.5, 'kg')$q$);
select t_check('a retest record now exists', (select count(*) from quality_checks where purchase_line_id='00000000-0000-0000-0000-0000000000e1' and is_retest) = 1);

\echo '===== P2-13: a certificate keeps the company details it was issued with'
select t_check('coa_records has a company_snapshot column of type jsonb', exists (select 1 from information_schema.columns where table_schema='public' and table_name='coa_records' and column_name='company_snapshot' and data_type='jsonb'));
select t_check('certificates issued before 0112 have no copy (null), so they keep printing the current details', not exists (select 1 from coa_records where company_snapshot is not null));

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
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c5','PK-T0001','Jar','packaging','nos','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c6','RM-T0002','Raw B (no activity)','raw','kg','00000000-0000-0000-0000-0000000000c1');


-- a row of the statement as text: opening|purchased|opening_load|produced|other_in|used|packaging|samples|wastage|rejected|other_out|closing
create or replace function public.t_st(p_item uuid, p_from date, p_to date) returns text language sql security definer as $$
  select format('%s|%s|%s|%s|%s|%s', trim_scale(opening), trim_scale(purchased), trim_scale(opening_load), trim_scale(other_in), trim_scale(rejected), trim_scale(closing))
    from public.stock_statement(p_from, p_to) where item_id = p_item $$;
grant execute on function public.t_st(uuid, date, date) to authenticated;
create or replace function public.t_day(p_off int, p_time text default '12:00') returns timestamptz language sql as $$
  select (((now() at time zone 'Asia/Kolkata')::date + p_off)::text || ' ' || p_time)::timestamp at time zone 'Asia/Kolkata' $$;
create or replace function public.t_d(p_off int) returns date language sql as $$ select (now() at time zone 'Asia/Kolkata')::date + p_off $$;



\echo '===== set-up: an MFR (created by the MFR manager)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;
select t_ok('MFR created with one line (2 kg Raw A)', $q$select create_mfr_definition('Recipe MFR', 10, 'kg', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic')$q$);

\echo '===== P10-09 a: update_mfr_recipe'
select t_ok('MFR manager replaces the recipe with two lines', $q$select update_mfr_recipe((select id from mfr_definitions where name='Recipe MFR'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":3,"unit":"kg"},{"item_id":"00000000-0000-0000-0000-0000000000c6","quantity":1.5,"unit":"kg"}]'::jsonb)$q$);
select t_check('the old line is gone and exactly two lines remain', (select count(*) from mfr_lines where mfr_definition_id=(select id from mfr_definitions where name='Recipe MFR')) = 2);
select t_check('the Raw A quantity is now 3', (select quantity from mfr_lines where mfr_definition_id=(select id from mfr_definitions where name='Recipe MFR') and item_id='00000000-0000-0000-0000-0000000000c3') = 3);
select t_fail('an empty recipe is refused', $q$select update_mfr_recipe((select id from mfr_definitions where name='Recipe MFR'), '[]'::jsonb)$q$, 'Add at least one recipe line');
select t_check('the refused empty edit left the two lines in place', (select count(*) from mfr_lines where mfr_definition_id=(select id from mfr_definitions where name='Recipe MFR')) = 2);
select t_fail('a zero quantity is refused', $q$select update_mfr_recipe((select id from mfr_definitions where name='Recipe MFR'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":0,"unit":"kg"}]'::jsonb)$q$, 'greater than 0');
select t_check('a refused line rolls the whole edit back (still two lines, Raw A still 3)', (select count(*) from mfr_lines where mfr_definition_id=(select id from mfr_definitions where name='Recipe MFR')) = 2
  and (select quantity from mfr_lines where mfr_definition_id=(select id from mfr_definitions where name='Recipe MFR') and item_id='00000000-0000-0000-0000-0000000000c3') = 3);
select t_fail('a line without a unit is refused', $q$select update_mfr_recipe((select id from mfr_definitions where name='Recipe MFR'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":""}]'::jsonb)$q$, 'item, quantity, and unit');
select t_fail('an unknown MFR is refused', $q$select update_mfr_recipe('00000000-0000-0000-0000-00000000ffff', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb)$q$, 'not found');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('a quality checker may not edit a recipe', $q$select update_mfr_recipe((select id from mfr_definitions where name='Recipe MFR'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb)$q$, 'Not authorized');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('the MFR is approved', $q$select approve_mfr_definition((select id from mfr_definitions where name='Recipe MFR'))$q$);
select t_fail('an approved MFR can no longer be edited', $q$select update_mfr_recipe((select id from mfr_definitions where name='Recipe MFR'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb)$q$, 'already approved');

\echo '===== P10-09 b: bulk_create_purchase_orders'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('a good file: two orders, three lines', $q$
  create temp table bulk_out as select * from bulk_create_purchase_orders('[
   {"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BULK-1","invoice_date":"2026-10-01","lines":[
     {"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg","unit_price":100,"gst_pct":5},
     {"item_id":"00000000-0000-0000-0000-0000000000c6","quantity":2,"unit":"kg","unit_price":0,"gst_pct":0}]},
   {"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BULK-2","invoice_date":"2026-10-02","lines":[
     {"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg","unit_price":90,"gst_pct":12}]}]'::jsonb);
  grant select on bulk_out to authenticated$q$);
select t_check('it reports two orders with 2 and 1 lines', (select count(*) from bulk_out) = 2 and (select sum(line_count) from bulk_out) = 3);
select t_check('the orders exist as drafts with their invoice numbers', (select count(*) from purchase_orders where invoice_number in ('BULK-1','BULK-2')) = 2);
select t_check('each line got its own batch number and the price and GST typed', (select count(distinct batch_number) from purchase_lines pl join purchase_orders po on po.id=pl.purchase_order_id where po.invoice_number in ('BULK-1','BULK-2')) = 3
  and exists (select 1 from purchase_lines pl join purchase_orders po on po.id=pl.purchase_order_id where po.invoice_number='BULK-1' and pl.unit_price=100 and pl.gst_pct=5));
select t_check('a bulk upload does not put stock on hand (drafts)', t_oh('00000000-0000-0000-0000-0000000000c3') = 0);
select t_fail('a line without a price is refused', $q$select * from bulk_create_purchase_orders('[{"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BULK-3","invoice_date":"2026-10-03","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg","gst_pct":0}]}]'::jsonb)$q$, 'unit price and a GST');
select t_fail('a zero quantity is refused', $q$select * from bulk_create_purchase_orders('[{"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BULK-4","invoice_date":"2026-10-03","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":0,"unit":"kg","unit_price":1,"gst_pct":0}]}]'::jsonb)$q$, 'greater than 0');
select t_fail('a line without a unit is refused', $q$select * from bulk_create_purchase_orders('[{"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BULK-5","invoice_date":"2026-10-03","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"","unit_price":1,"gst_pct":0}]}]'::jsonb)$q$, 'item, quantity, and unit');
select t_fail('an order without a vendor is refused', $q$select * from bulk_create_purchase_orders('[{"invoice_number":"BULK-6","invoice_date":"2026-10-03","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg","unit_price":1,"gst_pct":0}]}]'::jsonb)$q$, 'vendor is required');
select t_fail('an order without an invoice number is refused', $q$select * from bulk_create_purchase_orders('[{"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"","invoice_date":"2026-10-03","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg","unit_price":1,"gst_pct":0}]}]'::jsonb)$q$, 'invoice number is required');
select t_fail('an order with no lines is refused', $q$select * from bulk_create_purchase_orders('[{"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BULK-7","invoice_date":"2026-10-03","lines":[]}]'::jsonb)$q$, 'at least one line');
select t_fail('an empty file is refused', $q$select * from bulk_create_purchase_orders('[]'::jsonb)$q$, 'No purchase orders');
select t_fail('a good order followed by a bad one fails as a whole', $q$select * from bulk_create_purchase_orders('[
  {"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BULK-8","invoice_date":"2026-10-03","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg","unit_price":1,"gst_pct":0}]},
  {"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BULK-9","invoice_date":"2026-10-03","lines":[]}]'::jsonb)$q$, 'at least one line');
select t_check('nothing from the failed file was saved (BULK-8 absent)', not exists (select 1 from purchase_orders where invoice_number in ('BULK-3','BULK-4','BULK-5','BULK-6','BULK-7','BULK-8','BULK-9')));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('a quality checker may not bulk-create orders', $q$select * from bulk_create_purchase_orders('[{"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BULK-10","invoice_date":"2026-10-03","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg","unit_price":1,"gst_pct":0}]}]'::jsonb)$q$, 'Not authorized');

\echo '===== P10-09 c: the audit log cannot be changed'
reset role;
select t_check('the audit log has entries to test against', (select count(*) from audit_log) > 0);
create temp table audit_before as select count(*) n, max(changed_at) m from audit_log;
grant select on audit_before to authenticated;
select t_fail('UPDATE of an audit entry is refused (database owner)', $q$update audit_log set table_name='x' where id=(select id from audit_log limit 1)$q$, 'cannot be changed or deleted');
select t_fail('DELETE of an audit entry is refused (database owner)', $q$delete from audit_log where id=(select id from audit_log limit 1)$q$, 'cannot be changed or deleted');
select t_fail('DELETE of every audit entry is refused (database owner)', $q$delete from audit_log where true$q$, 'cannot be changed or deleted');
select t_fail('TRUNCATE of the audit log is refused (database owner)', $q$truncate audit_log$q$, 'cannot be changed or deleted');
select t_check('the audit log is unchanged after the attempts', (select count(*) from audit_log) >= (select n from audit_before) and not exists (select 1 from audit_log where table_name='x'));
-- the same attempts as the signed-in System Admin (whom the app lets do almost anything)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'allowed'; exception when others then return 'refused'; end $$;
select t_check('System Admin: UPDATE changes nothing', (select pg_temp.try($q$update audit_log set table_name='x' where true$q$)) = 'refused' or not exists (select 1 from audit_log where table_name='x'));
select t_check('System Admin: DELETE removes nothing', (select pg_temp.try($q$delete from audit_log where true$q$)) = 'refused' or (select count(*) from audit_log) >= (select n from audit_before));
select t_check('System Admin: TRUNCATE is refused', (select pg_temp.try($q$truncate audit_log$q$)) = 'refused');
select t_check('System Admin: a hand-made INSERT is refused', (select pg_temp.try($q$insert into audit_log (table_name,row_id,action) values ('x','00000000-0000-0000-0000-0000000000ff','insert')$q$)) = 'refused');
select t_check('still unchanged at the end', (select count(*) from audit_log) >= (select n from audit_before) and not exists (select 1 from audit_log where table_name='x'));

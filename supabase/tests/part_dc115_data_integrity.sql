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
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),('00000000-0000-0000-0000-0000000000a3','qc@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),('00000000-0000-0000-0000-0000000000a3','quality_checker');
update profiles set full_name = 'Asha Admin' where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set full_name = 'Imran Manager' where id = '00000000-0000-0000-0000-0000000000a2';
update profiles set full_name = 'Qadir Checker' where id = '00000000-0000-0000-0000-0000000000a3';
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Green Farms');

\echo '===== SCAN-P2-03: names are compared after cleaning'
select t_check('norm_name squeezes spaces, ignores case and a trailing full stop', public.norm_name('  Ashwa   Root. ') = 'ashwa root');
select t_check('norm_name of null is empty', public.norm_name(null) = '');

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('create raw item "Ashwa Root"', $q$insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000d1','RM-T0001','Ashwa Root','raw','kg','00000000-0000-0000-0000-0000000000c1')$q$);
select t_fail('"ashwa  root." (different case, two spaces, full stop) is refused', $q$insert into items (item_code,name,category,unit,item_type_id) values ('RM-T0002','ashwa  root.','raw','kg','00000000-0000-0000-0000-0000000000c1')$q$, 'items_name_norm_uq');
select t_fail('a packaging item with the same name is refused too', $q$insert into items (item_code,name,category,unit) values ('PKG-T0001','ASHWA ROOT','packaging','nos')$q$, 'items_name_norm_uq');
select t_check('item_name_taken says yes for the cleaned name', (select item_name_taken('Ashwa   root', null)));
select t_check('...and no when it is the item itself', not (select item_name_taken('Ashwa Root', '00000000-0000-0000-0000-0000000000d1')));
select t_check('...and no for a new name', not (select item_name_taken('Brahmi', null)));
select t_ok('a Finished Product item may share a name with an MFR-created item (not in the rule)', $q$insert into items (item_code,name,category,unit) values ('FP-T0001','Ashwa Root','processed','kg'),('PKG-T0009','Ashwa Root','packaged_fp','nos')$q$);
select t_ok('the production stock item (RM-FP- code) may share the Finished Product name', $q$insert into items (item_code,name,category,unit,item_type_id) values ('RM-FP-00001','Ashwa Root','raw','kg','00000000-0000-0000-0000-0000000000c1')$q$);
select t_fail('two vendors "Green Farms" and "green  farms." are refused', $q$insert into vendors (vendor_code,name) values ('V-T2','green  farms.')$q$, 'vendors_name_norm_uq');
select t_check('vendor_name_taken returns the code of the existing vendor', (select vendor_name_taken('GREEN FARMS', null)) = 'V-T1');
select t_check('...and nothing for the vendor itself', (select vendor_name_taken('Green Farms', '00000000-0000-0000-0000-0000000000c2')) is null);
select t_fail('item types "Oil" and "oil " are refused', $q$insert into item_types (description) values ('oil ')$q$, 'item_types_description_norm_uq');
select t_ok('a different item type is fine', $q$insert into item_types (description) values ('Powder')$q$);

\echo '===== SCAN-P2-02: raw material needs an item type; no deactivation with stock'
select t_fail('a raw item without an item type is refused', $q$insert into items (item_code,name,category,unit) values ('RM-T0003','Typeless','raw','kg')$q$, 'items_raw_needs_item_type');
select t_ok('a packaging item needs no item type', $q$insert into items (id,item_code,name,category,unit) values ('00000000-0000-0000-0000-0000000000d2','PKG-T0002','Jar','packaging','nos')$q$);
reset role;
insert into inventory_ledger (event_type,item_id,quantity,unit,reference_type,reason) values ('push','00000000-0000-0000-0000-0000000000d1',12.5,'kg','purchase','test stock');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('an item with stock on hand cannot be made inactive', $q$update items set active = false where id = '00000000-0000-0000-0000-0000000000d1'$q$, 'still has 12.5 kg on hand');
select t_ok('an item without stock can be made inactive', $q$update items set active = false where id = '00000000-0000-0000-0000-0000000000d2'$q$);
select t_ok('...and active again', $q$update items set active = true where id = '00000000-0000-0000-0000-0000000000d2'$q$);
reset role;
insert into inventory_ledger (event_type,item_id,quantity,unit,reference_type,reason) values ('pull','00000000-0000-0000-0000-0000000000d1',12.5,'kg','purchase','used up');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('once the stock is used up the item can be made inactive', $q$update items set active = false where id = '00000000-0000-0000-0000-0000000000d1'$q$);
select t_ok('...and active again', $q$update items set active = true where id = '00000000-0000-0000-0000-0000000000d1'$q$);

\echo '===== SCAN-P2-01: category is fixed once the item has records'
select t_check('item_has_records is false for a new item', not (select item_has_records('00000000-0000-0000-0000-0000000000d2')));
select t_ok('an item with no records can change category (packaging to raw)', $q$update items set category = 'raw', item_type_id = '00000000-0000-0000-0000-0000000000c1' where id = '00000000-0000-0000-0000-0000000000d2'$q$);
select t_ok('...and back', $q$update items set category = 'packaging', item_type_id = null where id = '00000000-0000-0000-0000-0000000000d2'$q$);
select t_check('item_has_records is true once the ledger has a row', (select item_has_records('00000000-0000-0000-0000-0000000000d1')));
select t_fail('Raw Material to Packaging is refused once it has stock movements', $q$update items set category = 'packaging' where id = '00000000-0000-0000-0000-0000000000d1'$q$, 'can''t be changed: it already has');
select t_fail('nothing can be switched to Finished Product', $q$update items set category = 'processed' where id = '00000000-0000-0000-0000-0000000000d2'$q$, 'to or from Finished Product');
select t_fail('a Finished Product item cannot become raw material', $q$update items set category = 'raw', item_type_id = '00000000-0000-0000-0000-0000000000c1' where item_code = 'FP-T0001'$q$, 'to or from Finished Product');
select t_ok('saving an item without changing its category is fine', $q$update items set botanical_alias = 'Withania' where id = '00000000-0000-0000-0000-0000000000d1'$q$);

\echo '===== SCAN-P2-12: display names'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_fail('a quality checker cannot rename themselves', $q$update profiles set full_name = 'Asha Admin 2' where id = '00000000-0000-0000-0000-0000000000a3'$q$, 'Only the System Administrator');
select t_fail('a quality checker cannot use the admin function', $q$select set_display_name('00000000-0000-0000-0000-0000000000a3','Someone')$q$, 'Only the System Administrator');
select t_ok('saving a profile without touching the name is fine', $q$update profiles set updated_by = '00000000-0000-0000-0000-0000000000a3' where id = '00000000-0000-0000-0000-0000000000a3'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('the System Administrator renames a user', $q$select set_display_name('00000000-0000-0000-0000-0000000000a3','  Qadir   Khan  ')$q$);
select t_check('the name is cleaned of extra spaces', (select full_name from profiles where id = '00000000-0000-0000-0000-0000000000a3') = 'Qadir Khan');
select t_fail('another user cannot be given the same name (any capitals, spaces)', $q$select set_display_name('00000000-0000-0000-0000-0000000000a3','asha  admin')$q$, 'already has the name');
select t_fail('more than 100 characters refused', $q$select set_display_name('00000000-0000-0000-0000-0000000000a3', repeat('x',101))$q$, 'at most 100');
select t_fail('a blank name refused', $q$select set_display_name('00000000-0000-0000-0000-0000000000a3','   ')$q$, 'Enter a name');
select t_fail('an unknown user is refused', $q$select set_display_name('00000000-0000-0000-0000-0000000000ff','Nobody')$q$, 'User not found');
select t_check('display_name_taken sees an existing name', (select display_name_taken('QADIR KHAN', null)));
select t_check('...but not for the person themselves', not (select display_name_taken('Qadir Khan', '00000000-0000-0000-0000-0000000000a3')));
select t_ok('the System Administrator can still edit their own name directly', $q$update profiles set full_name = 'Asha A. Admin' where id = '00000000-0000-0000-0000-0000000000a1'$q$);
reset role;
select t_fail('the database refuses a name over 100 characters', $q$update profiles set full_name = repeat('y',101) where id = '00000000-0000-0000-0000-0000000000a2'$q$, 'profiles_full_name_len');
select t_fail('the database refuses two people with the same cleaned name', $q$update profiles set full_name = 'qadir khan' where id = '00000000-0000-0000-0000-0000000000a2'$q$, 'profiles_full_name_norm_uq');
select t_check('the change is in the audit log', (select count(*) from audit_log where table_name = 'profiles' and action = 'update') >= 1);

\echo '===== SCAN-P2-09: MFR unit and GST %'
select t_fail('an MFR with the unit "tonne" is refused', $q$insert into mfr_definitions (code, name, batch_size_qty, batch_size_unit) values ('MFR-T1','Tonne MFR',1,'tonne')$q$, 'Batch size unit must be one of');
select t_ok('an MFR with the unit "kg" is accepted', $q$insert into mfr_definitions (code, name, batch_size_qty, batch_size_unit) values ('MFR-T2','Kg MFR',1,'kg')$q$);
select t_fail('changing the unit to "tonne" is refused', $q$update mfr_definitions set batch_size_unit = 'tonne' where code = 'MFR-T2'$q$, 'Batch size unit must be one of');
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000e0','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
select t_fail('GST 1800 % on a purchase line is refused', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B1',10,'kg',0,0,0,5,1800)$q$, 'purchase_lines_gst_pct_max');
select t_ok('GST 18 % is accepted', $q$insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e0','00000000-0000-0000-0000-0000000000d1','B2',10,'kg',0,0,0,5,18)$q$);
select t_check('a purchase line now makes the category fixed for Raw Material (PO line exists)', (select _item_has_records('00000000-0000-0000-0000-0000000000d1')));

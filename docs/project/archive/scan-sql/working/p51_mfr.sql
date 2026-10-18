\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
insert into items (id,item_code,name,category,unit) values
 ('00000000-0000-0000-0000-00000000c501','PK-T501','Test bottle','packaging','nos'),
 ('00000000-0000-0000-0000-00000000c502','RM-T502','Test herb B','raw','kg'),
 ('00000000-0000-0000-0000-00000000c503','RM-T503','Inactive herb','raw','kg');
update items set active = false where id='00000000-0000-0000-0000-00000000c503';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('A recipe containing a PACKAGING item (bottle)', $q$select * from create_mfr_definition('Scan MFR A', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-00000000c501","quantity":5,"unit":"nos"},{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg"}]'::jsonb)$q$);
select t_ok('B recipe with the SAME item on two lines', $q$select * from create_mfr_definition('Scan MFR B', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg"},{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":3,"unit":"kg"}]'::jsonb)$q$);
select t_ok('C recipe with an INACTIVE item', $q$select * from create_mfr_definition('Scan MFR C', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-00000000c503","quantity":5,"unit":"kg"}]'::jsonb)$q$);
select t_ok('D recipe with an incompatible unit (litres for a kg item)', $q$select * from create_mfr_definition('Scan MFR D', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"ltr"}]'::jsonb)$q$);
select t_ok('E recipe in g for a kg item (conversion)', $q$select * from create_mfr_definition('Scan MFR E', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5000,"unit":"g"}]'::jsonb)$q$);
select t_ok('F name differing only by spaces / case ("scan  mfr e")', $q$select * from create_mfr_definition('scan mfr  e', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb)$q$);
select t_ok('G the batch size is 10 kg but recipe lines add to 5 kg (no check)', $q$select * from create_mfr_definition('Scan MFR G', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb)$q$);
reset role;
select 'MFR rows: ' || string_agg(name, ' | ' order by name) from mfr_definitions where name ilike 'scan mfr%';
select 'line E stored as: ' || l.quantity || ' ' || l.unit from mfr_lines l join mfr_definitions d on d.id=l.mfr_definition_id where d.name='Scan MFR E';
-- approval by the creator
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('H the creator approves their own MFR', $q$select * from approve_mfr_definition((select id from mfr_definitions where name='Scan MFR G'))$q$);
reset role;
select 'approved_by = created_by: ' || (approved_by = created_by) from mfr_definitions where name='Scan MFR G';
rollback;

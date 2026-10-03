\set ON_ERROR_STOP off
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$ begin execute p_sql; raise notice 'PASS  | ok      | % (as %)', p_label, current_user; exception when others then raise notice 'FAIL  | ok      | % (as %) -> %', p_label, current_user, sqlerrm; end $$;
create or replace function public.t_fail(p_label text, p_sql text, p_expect text) returns void language plpgsql as $$ begin execute p_sql; raise notice 'FAIL  | blocked | % -> ALLOWED', p_label; exception when others then if position(p_expect in sqlerrm) > 0 then raise notice 'PASS  | blocked | % -> %', p_label, sqlerrm; else raise notice 'FAIL  | blocked | % -> wrong error: %', p_label, sqlerrm; end if; end $$;
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$ begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to authenticated, anon;

insert into auth.users (id,email) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000b1','inv@t'),
 ('00000000-0000-0000-0000-0000000000c1','mfr@t'),('00000000-0000-0000-0000-0000000000d1','qc@t');
insert into user_roles values
 ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000b1','inventory_manager'),
 ('00000000-0000-0000-0000-0000000000c1','mfr_manager'),('00000000-0000-0000-0000-0000000000d1','quality_checker');
insert into item_types (id, description) values ('00000000-0000-0000-0000-00000000f001','Churna');
insert into items (id, item_code, name, category, unit, item_type_id) values
 ('00000000-0000-0000-0000-00000000e001','RM-001','Ashwagandha root','raw','kg','00000000-0000-0000-0000-00000000f001'),
 ('00000000-0000-0000-0000-00000000e002','RM-002','Brahmi','raw','kg','00000000-0000-0000-0000-00000000f001'),
 ('00000000-0000-0000-0000-00000000e003','PKG-00001','Bottle 100 ml','packaging','nos',null),
 ('00000000-0000-0000-0000-00000000e004','RM-004','Shatavari','raw','kg',null);
insert into mfr_definitions (id, code, name, batch_size_qty, batch_size_unit) values
 ('00000000-0000-0000-0000-00000000a001','MFR-0001','Hair oil',100,'Ltr'),
 ('00000000-0000-0000-0000-00000000a002','MFR-0002','Cough syrup',50,'Ltr');

-- the old per-Item-Type shape is gone
select t_check('templates no longer have an item_type_id column', not exists (select 1 from information_schema.columns where table_name='coa_templates' and column_name='item_type_id'));
select t_check('old two-argument upsert is gone', not exists (select 1 from pg_proc where proname='upsert_coa_template' and pronargs=2));

-- roles: raw material template follows item editors; MFR template follows MFR editors
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select t_ok('inventory manager saves a raw material template', $q$select public.upsert_coa_template('00000000-0000-0000-0000-00000000e001', null, '[{"test":"pH","specification":"5-7"},{"test":"LOD","specification":"NMT 5%"}]'::jsonb)$q$);
select t_fail('inventory manager cannot save an MFR template', $q$select public.upsert_coa_template(null, '00000000-0000-0000-0000-00000000a001', '[{"test":"pH","specification":"5-7"}]'::jsonb)$q$, 'Not authorized');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false);
select t_ok('MFR manager saves an MFR template', $q$select public.upsert_coa_template(null, '00000000-0000-0000-0000-00000000a001', '[{"test":"Specific gravity","specification":"0.90-0.95"}]'::jsonb)$q$);
select t_ok('MFR manager can edit it again (no lock for approved or not)', $q$select public.upsert_coa_template(null, '00000000-0000-0000-0000-00000000a001', '[{"test":"Specific gravity","specification":"0.90-0.95"},{"test":"Colour","specification":"Pale yellow"}]'::jsonb)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',false);
select t_fail('QC checker cannot save a raw material template', $q$select public.upsert_coa_template('00000000-0000-0000-0000-00000000e002', null, '[{"test":"x","specification":"y"}]'::jsonb)$q$, 'Not authorized');

-- validation
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('neither item nor MFR is refused', $q$select public.upsert_coa_template(null, null, '[{"test":"x","specification":"y"}]'::jsonb)$q$, 'either a raw material or an MFR');
select t_fail('both item and MFR is refused', $q$select public.upsert_coa_template('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000a001', '[{"test":"x","specification":"y"}]'::jsonb)$q$, 'either a raw material or an MFR');
select t_fail('packaging item is refused', $q$select public.upsert_coa_template('00000000-0000-0000-0000-00000000e003', null, '[{"test":"x","specification":"y"}]'::jsonb)$q$, 'raw materials and MFRs only');
select t_fail('empty lines refused', $q$select public.upsert_coa_template('00000000-0000-0000-0000-00000000e002', null, '[]'::jsonb)$q$, 'At least one test');
select t_fail('blank specification refused', $q$select public.upsert_coa_template('00000000-0000-0000-0000-00000000e002', null, '[{"test":"pH","specification":" "}]'::jsonb)$q$, 'both Test and Specification');

-- results of the saves above
select t_check('one template per raw material, lines in order', (select array_agg(l.test order by l.seq) = array['pH','LOD'] from coa_template_lines l join coa_templates t on t.id=l.coa_template_id where t.item_id='00000000-0000-0000-0000-00000000e001'));
select t_check('MFR template has its 2 lines after the edit', (select count(*)=2 from coa_template_lines l join coa_templates t on t.id=l.coa_template_id where t.mfr_definition_id='00000000-0000-0000-0000-00000000a001'));
select t_check('MFR template has 2 revisions (first save and the edit)', (select count(*)=2 from coa_template_revisions r join coa_templates t on t.id=r.coa_template_id where t.mfr_definition_id='00000000-0000-0000-0000-00000000a001'));
select t_check('latest revision snapshot holds both tests', (select jsonb_array_length(r.lines)=2 from coa_template_revisions r join coa_templates t on t.id=r.coa_template_id where t.mfr_definition_id='00000000-0000-0000-0000-00000000a001' and r.revision_no=2));
select t_check('revision records who changed it', (select r.changed_by='00000000-0000-0000-0000-0000000000c1' from coa_template_revisions r join coa_templates t on t.id=r.coa_template_id where t.mfr_definition_id='00000000-0000-0000-0000-00000000a001' and r.revision_no=2));

-- nobody can write the revisions or the lines directly
select t_fail('direct insert into revisions refused', $q$insert into coa_template_revisions (coa_template_id, revision_no, lines) select id, 99, '[]' from coa_templates limit 1$q$, 'row-level security');
select t_fail('direct insert into lines refused', $q$insert into coa_template_lines (coa_template_id, seq, test, specification) select id, 9, 'x', 'y' from coa_templates limit 1$q$, 'row-level security');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select t_fail('inventory manager cannot insert a template row directly', $q$insert into coa_templates (item_id) values ('00000000-0000-0000-0000-00000000e002')$q$, 'row-level security');

-- register
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',false);
select t_check('register lists 3 raw materials and 2 MFRs, not the packaging item', (select count(*)=5 from coa_template_register));
select t_check('register marks which have a template', (select count(*) filter (where template_id is not null)=2 from coa_template_register));
select t_check('register shows test counts', (select tests=2 from coa_template_register where code='RM-001'));
select t_check('register shows the item type of a raw material', (select item_type='Churna' from coa_template_register where code='RM-001'));

-- bulk create
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('bulk create makes 2 templates', (select count(*)=2 from public.bulk_create_coa_templates('[{"item_id":"00000000-0000-0000-0000-00000000e002","lines":[{"test":"pH","specification":"5-7"}]},{"mfr_definition_id":"00000000-0000-0000-0000-00000000a002","lines":[{"test":"Clarity","specification":"Clear"}]}]'::jsonb)));
select t_fail('bulk create refuses a subject that already has a template', $q$select * from public.bulk_create_coa_templates('[{"item_id":"00000000-0000-0000-0000-00000000e001","lines":[{"test":"x","specification":"y"}]}]'::jsonb)$q$, 'already has a COA template');
select t_fail('bulk create refuses an empty file', $q$select * from public.bulk_create_coa_templates('[]'::jsonb)$q$, 'No COA template rows');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',false);
select t_fail('QC checker cannot bulk create', $q$select * from public.bulk_create_coa_templates('[{"item_id":"00000000-0000-0000-0000-00000000e004","lines":[{"test":"x","specification":"y"}]}]'::jsonb)$q$, 'Not authorized');
reset role; set role anon;
select t_fail('anon cannot save a template', $q$select public.upsert_coa_template('00000000-0000-0000-0000-00000000e002', null, '[{"test":"x","specification":"y"}]'::jsonb)$q$, 'permission denied');
reset role;

-- deleting the item removes its template
select t_ok('deleting an unused item also removes its template', $q$delete from items where id='00000000-0000-0000-0000-00000000e002'$q$);
select t_check('template of the deleted item is gone', not exists (select 1 from coa_templates where item_id='00000000-0000-0000-0000-00000000e002'));

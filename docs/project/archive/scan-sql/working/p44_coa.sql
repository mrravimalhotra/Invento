\set ON_ERROR_STOP off
\pset footer off
reset role;
select 'approved current QC: ' || q.ar_number || ' id=' || q.id from quality_checks q join purchase_lines pl on pl.id=q.purchase_line_id where pl.batch_number='OLD-EXP-42' and q.is_retest and q.status='approved';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
\echo === A: COA with a wrong batch number, product name, a changed specification and a bogus result
select t_ok('A insert COA 1 (header lies, spec edited)', $q$insert into coa_records (coa_number, quality_check_id, coa_type, header_data, result_lines, remarks, issued_by) select get_next_coa_number(), q.id, 'raw_material', '[{"label":"Batch No","value":"SOMETHING-ELSE"},{"label":"Product","value":"Not this item"}]'::jsonb, '[{"seq":1,"test":"Assay","specification":"NLT 1%","result":"99%"}]'::jsonb, 'ok', '00000000-0000-0000-0000-0000000000a1' from quality_checks q join purchase_lines pl on pl.id=q.purchase_line_id where pl.batch_number='OLD-EXP-42' and q.is_retest and q.status='approved'$q$);
\echo === B: a second COA for the same QC record
select t_ok('B insert COA 2 for the same QC', $q$insert into coa_records (coa_number, quality_check_id, coa_type, header_data, result_lines, remarks, issued_by) select get_next_coa_number(), q.id, 'raw_material', '[]'::jsonb, '[]'::jsonb, '', null from quality_checks q join purchase_lines pl on pl.id=q.purchase_line_id where pl.batch_number='OLD-EXP-42' and q.is_retest and q.status='approved'$q$);
\echo === C: change or remove an issued COA
select t_ok('C update COA remarks', $q$update coa_records set remarks='changed' where true$q$);
select t_ok('D delete COA', $q$delete from coa_records where true$q$);
reset role;
select 'COA rows now: ' || count(*) || '; remarks values: ' || coalesce(string_agg(distinct remarks, ','),'-') || '; issued_by: ' || coalesce(string_agg(distinct issued_by::text, ','),'-') from coa_records;

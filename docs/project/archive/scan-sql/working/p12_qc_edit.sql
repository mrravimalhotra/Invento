\pset footer off
set role authenticated;
\echo === E: Round-1 role (quality_checker a4) edits an already APPROVED record (f1)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('E1 change status approved -> rejected', $q$update quality_checks set status='rejected' where id='00000000-0000-0000-0000-0000000000f1'$q$);
select 'E1 result status=' || status from quality_checks where id='00000000-0000-0000-0000-0000000000f1';
select t_ok('E2 change sample_qty on decided record', $q$update quality_checks set sample_qty=99 where id='00000000-0000-0000-0000-0000000000f1'$q$);
select t_ok('E3 change ar_number on decided record', $q$update quality_checks set ar_number='AR-HACK' where id='00000000-0000-0000-0000-0000000000f1'$q$);
select t_ok('E4 change reviewed_by after decision', $q$update quality_checks set reviewed_by='00000000-0000-0000-0000-0000000000a4' where id='00000000-0000-0000-0000-0000000000f1'$q$);
select 'E result: status=' || status || ' sample_qty=' || sample_qty || ' ar=' || ar_number || ' reviewed_by=' || reviewed_by from quality_checks where id='00000000-0000-0000-0000-0000000000f1';
\echo === F: mfr_manager inserts QC record directly
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('F1 inventory_manager inserts a QC row for line e2 already decided?', $q$insert into quality_checks (ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status) values ('AR-T9','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',0.5,'kg','approved')$q$);
select t_ok('F2 inventory_manager inserts QC row already checker_approved', $q$insert into quality_checks (ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status) values ('AR-T10','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0.5,'kg','checker_approved')$q$);

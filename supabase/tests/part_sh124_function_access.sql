\set ON_ERROR_STOP on
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;

\echo '===== 0124: function access hardening'
select t_check('no public function can be run by someone who is not signed in',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prokind = 'f' and p.proname not like 't\_%'
                 and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
                 and has_function_privilege('anon', p.oid, 'execute')));
select t_check('no trigger function can be called by a signed-in user',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
                 and has_function_privilege('authenticated', p.oid, 'execute')));
select t_check('the three internal helpers are closed to signed-in users and open to the service role',
  not has_function_privilege('authenticated', 'public.can_manage_coa_template(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.check_sufficient_stock(uuid,numeric)', 'execute')
  and not has_function_privilege('authenticated', 'public.stability_reserve_left(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.check_sufficient_stock(uuid,numeric)', 'execute'));
select t_check('every function the app calls is still open to signed-in users',
  not exists (select 1 from unnest(array[
    'approve_mfr_definition','audit_account_action','bulk_create_coa_templates','bulk_create_mfr_definitions',
    'bulk_create_purchase_orders','create_finished_product_batch','create_mfr_definition','create_packaging_issues',
    'create_production_issues','dashboard_qc_counts','display_name_taken','expire_stale_fp_drafts','fp_batch_block_reason',
    'fp_batch_block_reasons','fp_bulk_left_many','get_next_ar_number','get_next_batch_number','get_next_coa_number',
    'get_next_dead_stock_code','get_next_dead_stock_codes','get_next_equipment_code','get_next_equipment_codes',
    'get_next_feedback_ticket','get_next_fp_batch_number','get_next_item_code','get_next_item_codes','get_next_po_number',
    'get_next_vendor_code','get_next_vendor_codes','item_has_records','item_name_taken','load_opening_finished_product',
    'load_opening_stock','peek_next_dead_stock_code','peek_next_equipment_code','peek_next_item_code','peek_next_vendor_code',
    'purge_test_data','qc_is_current_approval','record_wastage','reopen_purchase_order','set_company_settings',
    'set_display_name','set_idle_timeout','set_opening_stock_open','set_user_roles','start_fp_retest','start_retest',
    'stock_integrity_check','stock_statement','submit_fp_batch_to_qc','submit_purchase_order','trace_batch',
    'undo_opening_load','update_mfr_procedure','update_mfr_recipe','upsert_coa_template','vendor_name_taken',
    'has_any_role','has_role','has_app_access','is_signed_in','fp_bulk_left','fp_stability_reserve_left',
    '_item_stock_unit','_unit_factor','get_next_fp_ar_number','convert_unit']) f(name)
   where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f.name
                       and has_function_privilege('authenticated', p.oid, 'execute'))));
select t_check('every public function has a fixed search_path',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prokind = 'f' and p.proname not like 't\_%'
                 and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
                 and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')));
select t_check('the path is the one the API already uses',
  (select 'search_path=public, extensions' = any(proconfig) from pg_proc where oid = 'public.convert_unit(numeric,text,text)'::regprocedure));

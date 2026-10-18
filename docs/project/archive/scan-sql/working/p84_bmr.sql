-- P8.4 repro: deprecated BMR has no lock after sign-off; four roles can write directly (rolled back)
begin;
alter table bmr_records drop constraint bmr_records_finished_product_batch_id_fkey;   -- scratch copy only: lets a seed row exist without a full FP batch
insert into bmr_records(id, finished_product_batch_id, prepared_by, prepared_at, checked_by, checked_at, approved_by, approved_at)
 values ('11111111-1111-1111-1111-111111111111', gen_random_uuid(),
         '00000000-0000-0000-0000-0000000000a1', now(), '00000000-0000-0000-0000-0000000000a1', now(), '00000000-0000-0000-0000-0000000000a1', now());
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',true);   -- Quality Checker
select set_config('request.jwt.claim.role','authenticated',true);
insert into bmr_observations(bmr_record_id, step_label, reading, recorded_by) values ('11111111-1111-1111-1111-111111111111','Drying','55 C',null) returning 'observation added AFTER approval ALLOWED';
update bmr_records set approved_by = '00000000-0000-0000-0000-0000000000a5', approved_at = '2020-01-01' where id='11111111-1111-1111-1111-111111111111' returning 'approver and approval time rewritten ALLOWED';
update bmr_records set prepared_at = null, checked_at = null where id='11111111-1111-1111-1111-111111111111' returning 'earlier sign-offs removed ALLOWED';
delete from bmr_records where id='11111111-1111-1111-1111-111111111111' returning 'approved BMR deleted ALLOWED';
rollback;

begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
insert into quality_checks (id, ar_number, purchase_line_id, item_id, sample_qty, sample_unit, status)
 values ('00000000-0000-0000-0000-00000000c201', get_next_ar_number(), '00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-0000000000c3', 1, 'kg', 'submitted');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',true);
update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-00000000c201';
commit;

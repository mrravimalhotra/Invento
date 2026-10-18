begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',true);
update quality_checks set status='approved', retest_period_days=90, expiry_date=current_date+400, reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now() where id='00000000-0000-0000-0000-00000000c201' returning 'A (QC Reviewer) approved';
select pg_sleep(4);
commit;

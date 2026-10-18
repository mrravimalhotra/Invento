begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
update quality_checks set status='rejected', review_comments='not suitable', reviewed_by='00000000-0000-0000-0000-0000000000a1', reviewed_at=now() where id='00000000-0000-0000-0000-00000000c201' returning 'B (System Admin) rejected';
commit;

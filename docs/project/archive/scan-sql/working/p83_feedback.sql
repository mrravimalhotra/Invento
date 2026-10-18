begin; set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',true);
select set_config('request.jwt.claim.role','authenticated',true);
-- A: ticket number, name and text are client-supplied
insert into page_feedback(ticket_number,page_path,page_label,url_path,observation,submitted_by,submitted_by_name)
 values ('FB-9999','/x','X','/x',repeat('a',2000000),'00000000-0000-0000-0000-0000000000a4','The Managing Director') returning 'fake ticket no + fake name + 2 MB text ALLOWED', length(observation);
-- B: owner sets category and the admin-only reply on own new ticket
update page_feedback set category='invalid', claude_notes='Fixed in last release', created_at='2020-01-01' where ticket_number='FB-9999' returning 'owner set category/reply/created_at ALLOWED';
-- C: owner cannot self-resolve
savepoint s;
update page_feedback set status='implemented' where ticket_number='FB-9999' returning 'owner set status implemented';
rollback;

begin; set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into environmental_control_readings(area,temperature) values ('A','Infinity'::numeric) returning 'Infinity temp ALLOWED';
savepoint s; insert into documents(doc_type,title,revision_number,file_url) values ('sop','T',1.5,'x') returning revision_number;
rollback;

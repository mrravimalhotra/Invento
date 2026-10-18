-- P8.2 repro: documents / environmental readings / line clearance (rolled back)
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
-- documents: odd revisions, non-http URL, duplicate title+revision
insert into documents(doc_type,title,revision_number,file_url) values ('sop','SOP-X',-3,'javascript:alert(1)') returning 'doc neg rev + js url ALLOWED';
insert into documents(doc_type,title,revision_number,file_url) values ('sop','SOP-X',-3,'x') returning 'doc duplicate title+rev ALLOWED';
insert into documents(doc_type,title,revision_number,file_url,effective_date) values ('stp','STP-Y',0,'https://a.b','1900-01-01') returning 'effective date 1900 ALLOWED';
update documents set file_url='https://other', revision_number=revision_number where title='SOP-X' and revision_number=-3 returning 'doc link swapped, same revision ALLOWED';
-- env readings
insert into environmental_control_readings(area,temperature,humidity) values ('RM Store',9999,-50) returning 'temp 9999/humidity -50 ALLOWED';
insert into environmental_control_readings(area) values ('RM Store') returning 'empty reading (no temp, no humidity) ALLOWED';
insert into environmental_control_readings(area,temperature,recorded_at) values ('RM Store',25,'2020-01-01') returning 'backdated recorded_at ALLOWED';
insert into environmental_control_readings(area,temperature,recorded_at) values ('RM Store',25,'2031-01-01') returning 'future recorded_at ALLOWED';
insert into environmental_control_readings(area,temperature,recorded_by) values ('RM Store',25,'00000000-0000-0000-0000-0000000000a2') returning 'recorded_by set to another user ALLOWED';
-- line clearance
insert into line_clearance_checks(area,batch_reference,status,checked_by) values ('Gran 1','NO-SUCH-BATCH','clear','00000000-0000-0000-0000-0000000000a2') returning 'free-text batch + other user as checker ALLOWED';
insert into line_clearance_checks(area,status,checked_at) values ('Gran 1','clear','2020-01-01') returning 'backdated check ALLOWED';
-- edit / delete
update line_clearance_checks set status='clear' where area='Gran 1' returning 'lc update ALLOWED';
delete from environmental_control_readings where area='RM Store' returning 'env delete ALLOWED';
rollback;

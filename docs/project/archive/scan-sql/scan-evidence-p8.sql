-- Phase 8 evidence. Reproductions run only on a local scratch copy; never run on a real database.
-- P8.1 reproduction (rolls back): see the first block. Read-only checks for the live database follow.

-- SCAN-P8-01 (reproduction, scratch database only): rows a signed-in user can save directly.
-- begin; set role authenticated; select set_config('request.jwt.claim.sub','<a user id>',false);
-- insert into equipment(equipment_code,name,quantity,calibration_status,last_calibration_date,next_calibration_due)
--   values ('EQ-T1','Balance',2.5,'calibrated','2020-01-10','2021-01-10');   -- ALLOWED: status Calibrated, due date long past, quantity 2.5
-- insert into equipment(equipment_code,name,calibration_status,last_calibration_date,next_calibration_due)
--   values ('EQ-T2','Oven','calibrated','2026-10-01','2026-01-01');          -- ALLOWED: next due before the last calibration
-- insert into dead_stock_items(asset_code,article_name,quantity,purchase_price,rejected_qty,rejected_value,balance_qty,balance_value)
--   values ('DS-T1','PC',4,40000,10,1,100,5);                                -- ALLOWED: rejected 10 of 4, balance 100, value 5
-- insert into dead_stock_items(asset_code,article_name,date_of_purchase,resolution_date) values ('DS-T2','Chair','2030-01-01','2020-01-01'); -- ALLOWED: bought in 2030, resolved in 2020
-- insert into equipment(equipment_code,name,last_calibration_date) values ('EQ-T3','Scale','2031-05-05');  -- ALLOWED: calibrated in 2031
-- rollback;

-- Live read-only check 1: equipment marked Calibrated whose next due date has passed.
select equipment_code, name, calibration_status, last_calibration_date, next_calibration_due
from equipment where active and calibration_status = 'calibrated' and next_calibration_due < current_date
order by next_calibration_due limit 100;

-- Live read-only check 2: equipment with a due date but no status, or a status of Due/Calibrated with no dates at all.
select count(*) filter (where calibration_status is null and next_calibration_due is not null) as date_but_no_status,
       count(*) filter (where calibration_status in ('calibrated','due') and last_calibration_date is null and next_calibration_due is null) as status_but_no_dates,
       count(*) filter (where next_calibration_due < last_calibration_date) as due_before_last
from equipment where active;

-- Live read-only check 3: dead stock rows where the figures do not agree with each other.
select asset_code, article_name, quantity, rejected_qty, balance_qty, depreciated_unit_value, balance_value
from dead_stock_items
where active and (
      rejected_qty > quantity
   or (balance_qty is not null and balance_qty <> quantity - rejected_qty)
   or (balance_qty is not null and balance_value is not null and abs(balance_value - balance_qty * depreciated_unit_value) > 1)
   or (balance_qty is null and balance_value is not null))
order by asset_code limit 200;

-- Live read-only check 4: deactivated records that no list shows.
select (select count(*) from equipment where not active) as inactive_equipment,
       (select count(*) from dead_stock_items where not active) as inactive_dead_stock;


-- ============================================================
-- P8.2 evidence: Documents, Environmental Control, Line Clearance
-- Run on a scratch copy (all statements end in a rollback). Role: authenticated, user = System Admin.
-- ============================================================
-- Section P8.2-A (documents): negative revision and a javascript: link, duplicate title+revision,
-- 1900 effective date, link swapped under the same revision -> all ALLOWED; revision 1.5 is stored as 2.
-- Section P8.2-B (environmental): temperature 9999 / humidity -50, an empty reading, 'Infinity',
-- recorded_at 2020 and 2031, recorded_by another user -> all ALLOWED.
-- Section P8.2-C (line clearance): free-text batch reference 'NO-SUCH-BATCH', checked_by another user,
-- checked_at 2020 -> all ALLOWED.
-- Section P8.2-D: update line_clearance_checks / delete environmental_control_readings -> 0 rows (no policy).
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into documents(doc_type,title,revision_number,file_url) values ('sop','SOP-X',-3,'javascript:alert(1)');
insert into documents(doc_type,title,revision_number,file_url) values ('sop','SOP-X',-3,'x');
insert into documents(doc_type,title,revision_number,file_url,effective_date) values ('stp','STP-Y',0,'https://a.b','1900-01-01');
update documents set file_url='https://other' where title='SOP-X' and revision_number=-3;
insert into documents(doc_type,title,revision_number,file_url) values ('sop','T',1.5,'x') returning revision_number;  -- 2
insert into environmental_control_readings(area,temperature,humidity) values ('RM Store',9999,-50);
insert into environmental_control_readings(area) values ('RM Store');
insert into environmental_control_readings(area,temperature) values ('RM Store','Infinity'::numeric);
insert into environmental_control_readings(area,temperature,recorded_at) values ('RM Store',25,'2020-01-01');
insert into line_clearance_checks(area,batch_reference,status) values ('Gran 1','NO-SUCH-BATCH','clear');
update line_clearance_checks set status='clear' where area='Gran 1';          -- UPDATE 0
delete from environmental_control_readings where area='RM Store';              -- DELETE 0
rollback;

-- Live read-only check 5: documents with the same title and doc type on the list at more than one active revision
select doc_type, title, count(*) as active_revisions, max(revision_number) as highest
from documents where active group by doc_type, title having count(*) > 1 order by title;

-- Live read-only check 6: odd values already stored
select (select count(*) from documents where revision_number < 0 or file_url !~* '^https?://') as odd_documents,
       (select count(*) from environmental_control_readings where temperature is null and humidity is null) as empty_readings,
       (select count(*) from environmental_control_readings where humidity not between 0 and 100 or temperature not between -40 and 80) as implausible_readings,
       (select count(*) from line_clearance_checks where status = 'not_clear') as not_clear_checks,
       (select count(*) from line_clearance_checks lc where batch_reference is not null
          and not exists (select 1 from finished_product_batches b where b.batch_number = lc.batch_reference)
          and not exists (select 1 from production_issue_batches p where p.batch_number = lc.batch_reference)) as batch_ref_matches_nothing;


-- ============================================================
-- P8.3 evidence: Feedback tickets (rolled back; role: authenticated, user = Quality Checker)
-- ============================================================
-- Section P8.3-A: insert with ticket_number 'FB-9999' and a 2 MB text -> ALLOWED (a typed name is replaced by the real one at insert, 0086);
--   owner update of submitted_by_name to 'The Managing Director' -> ALLOWED;
--   owner update of category, claude_notes and created_at on own 'new' ticket -> ALLOWED;
--   owner update of status to 'implemented' -> refused by the owner rule (good).
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into page_feedback(ticket_number,page_path,page_label,url_path,observation,submitted_by,submitted_by_name)
 values ('FB-9999','/x','X','/x',repeat('a',2000000),'00000000-0000-0000-0000-0000000000a4','anything');
update page_feedback set submitted_by_name='The Managing Director' where ticket_number='FB-9999';
update page_feedback set category='invalid', claude_notes='Fixed in last release', created_at='2020-01-01' where ticket_number='FB-9999';
rollback;

-- Live read-only check 7: tickets whose category or reply was filled while the status is still 'new' (can only be admin-set or a direct-call tester)
select ticket_number, submitted_by_name, category, left(claude_notes, 60) as reply
from page_feedback where status = 'new' and (category is not null or claude_notes is not null) order by ticket_number;

-- Live read-only check 8: longest ticket texts and tickets resolved after a later update (resolved_at later than updated_at is normal; resolved_at far after the first resolution cannot be told apart, see the audit trail)
select ticket_number, length(observation) as chars from page_feedback order by length(observation) desc limit 5;


-- ============================================================
-- P8.4 evidence: deprecated BMR (scratch copy; rolled back; the FK is dropped inside the transaction only to seed a row)
-- ============================================================
-- Section P8.4-A: see sql/p84_bmr.sql in the working folder. Result as Quality Checker on an approved record:
--   insert into bmr_observations ... -> ALLOWED; update bmr_records set approved_by/approved_at -> ALLOWED;
--   update bmr_records set prepared_at = null, checked_at = null -> ALLOWED; delete from bmr_records -> refused.
begin;
alter table bmr_records drop constraint bmr_records_finished_product_batch_id_fkey;
insert into bmr_records(id, finished_product_batch_id, prepared_by, prepared_at, checked_by, checked_at, approved_by, approved_at)
 values ('11111111-1111-1111-1111-111111111111', gen_random_uuid(),
         '00000000-0000-0000-0000-0000000000a1', now(), '00000000-0000-0000-0000-0000000000a1', now(), '00000000-0000-0000-0000-0000000000a1', now());
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into bmr_observations(bmr_record_id, step_label, reading, recorded_by) values ('11111111-1111-1111-1111-111111111111','Drying','55 C',null);
update bmr_records set approved_by = '00000000-0000-0000-0000-0000000000a5', approved_at = '2020-01-01' where id='11111111-1111-1111-1111-111111111111';
update bmr_records set prepared_at = null, checked_at = null where id='11111111-1111-1111-1111-111111111111';
rollback;

-- Live read-only check 9: how many deprecated BMR records exist, and how many were prepared, checked and approved by the same person
select count(*) as bmr_records,
       count(*) filter (where approved_at is not null) as approved,
       count(*) filter (where prepared_by = checked_by and checked_by = approved_by) as same_person_all_three
from bmr_records;

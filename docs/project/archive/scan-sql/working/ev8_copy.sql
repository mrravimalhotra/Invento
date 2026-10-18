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

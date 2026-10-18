\set ON_ERROR_STOP off
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
insert into equipment(equipment_code,name,quantity,calibration_status,last_calibration_date,next_calibration_due) values ('EQ-T1','Balance 0.1 mg',2.5,'calibrated','2020-01-10','2021-01-10') returning equipment_code, quantity, calibration_status, next_calibration_due;
insert into equipment(equipment_code,name,calibration_status,last_calibration_date,next_calibration_due) values ('EQ-T2','Oven','calibrated','2026-10-01','2026-01-01') returning equipment_code;
insert into dead_stock_items(asset_code,article_name,quantity,purchase_price,rejected_qty,rejected_value,balance_qty,balance_value) values ('DS-T1','PC',4,40000,10,1,100,5) returning asset_code, depreciated_unit_value, rejected_qty, balance_qty, balance_value;
rollback;

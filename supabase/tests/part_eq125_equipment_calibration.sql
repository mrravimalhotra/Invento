\set ON_ERROR_STOP on
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'PASS  | ok      | %', p_label;
exception when others then raise notice 'FAIL  | ok      | % -> %', p_label, sqlerrm; end $$;
create or replace function public.t_fail(p_label text, p_sql text, p_expect text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'FAIL  | blocked | % -> statement was ALLOWED', p_label;
exception when others then
  if position(p_expect in sqlerrm) > 0 then raise notice 'PASS  | blocked | % -> %', p_label, sqlerrm;
  else raise notice 'FAIL  | blocked | % -> wrong error: %', p_label, sqlerrm; end if; end $$;
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;

\echo '===== 0125: equipment calibration rules (as postgres: table rules apply to everyone)'
select t_ok('needs calibration with a Next due date is accepted', $q$insert into equipment (equipment_code,name,calibration_status,last_calibration_date,next_calibration_due) values ('EQ-C1','Balance','required',current_date - 30,current_date + 335)$q$);
select t_fail('needs calibration without Next due is refused', $q$insert into equipment (equipment_code,name,calibration_status) values ('EQ-C2','pH meter','required')$q$, 'equipment_next_due_required');
select t_ok('not applicable needs no dates', $q$insert into equipment (equipment_code,name,calibration_status) values ('EQ-C3','Tank','not_applicable')$q$);
select t_check('a row saved without a status is Not applicable', (select calibration_status = 'not_applicable' from equipment where equipment_code = 'EQ-C3'));
select t_fail('the old typed status Calibrated is no longer accepted', $q$insert into equipment (equipment_code,name,calibration_status,next_calibration_due) values ('EQ-C4','Oven','calibrated',current_date + 10)$q$, 'equipment_calibration_status_check');
select t_fail('Next due on or before Last calibration is refused', $q$insert into equipment (equipment_code,name,calibration_status,last_calibration_date,next_calibration_due) values ('EQ-C5','Oven','required',current_date - 10,current_date - 10)$q$, 'equipment_next_due_after_last');
select t_fail('a Last calibration date in the future is refused', $q$insert into equipment (equipment_code,name,calibration_status,last_calibration_date,next_calibration_due) values ('EQ-C6','Oven','required',current_date + 5,current_date + 300)$q$, 'cannot be in the future');
select t_ok('an overdue Next due date is accepted (it is what the list warns about)', $q$insert into equipment (equipment_code,name,calibration_status,last_calibration_date,next_calibration_due) values ('EQ-C7','Oven','required',current_date - 400,current_date - 35)$q$);
select t_fail('a quantity of 1.5 is refused', $q$insert into equipment (equipment_code,name,quantity) values ('EQ-C8','Stirrer',1.5)$q$, 'equipment_quantity_whole');
select t_ok('a quantity of 3 is accepted', $q$insert into equipment (equipment_code,name,quantity) values ('EQ-C9','Stirrer',3)$q$);
select t_ok('editing another field of a record with a past Last calibration still works', $q$update equipment set room_no = 'R-12' where equipment_code = 'EQ-C7'$q$);

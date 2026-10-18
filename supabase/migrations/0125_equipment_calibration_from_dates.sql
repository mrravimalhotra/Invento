-- 0125: equipment calibration status worked out from the dates (SCAN-P8-01)
-- Ravi, 18 Oct 2026: the status is computed from Next due (Calibrated / Due in
-- N days / Overdue), shown on the list, Excel, record page and Dashboard; the
-- only choice left is "Needs calibration" or "Not applicable"; Next due is
-- required when the equipment needs calibration.
-- Stored values become 'required' / 'not_applicable'. Old typed values:
-- Calibrated and Due -> required; blank -> required when a Next due date is
-- on file, otherwise not_applicable. The new rules are NOT VALID so an older
-- row never blocks the migration; every new save is checked.

alter table public.equipment drop constraint if exists equipment_calibration_status_check;

update public.equipment
   set calibration_status = case
         when calibration_status in ('calibrated', 'due') then 'required'
         when calibration_status is null and next_calibration_due is not null then 'required'
         when calibration_status is null then 'not_applicable'
         else calibration_status
       end
 where calibration_status is distinct from 'not_applicable';

alter table public.equipment alter column calibration_status set default 'not_applicable';

alter table public.equipment
  add constraint equipment_calibration_status_check
    check (calibration_status in ('required', 'not_applicable')) not valid,
  add constraint equipment_next_due_required
    check (calibration_status is distinct from 'required' or next_calibration_due is not null) not valid,
  add constraint equipment_next_due_after_last
    check (next_calibration_due is null or last_calibration_date is null or next_calibration_due > last_calibration_date) not valid,
  add constraint equipment_quantity_whole
    check (quantity = trunc(quantity)) not valid;

-- A calibration cannot be dated in the future (India date). A trigger, because a
-- CHECK constraint must not depend on today's date.
create or replace function public.trg_fn_equipment_calibration_not_future()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if new.last_calibration_date is not null
     and new.last_calibration_date > (now() at time zone 'Asia/Kolkata')::date
     and (tg_op = 'INSERT' or new.last_calibration_date is distinct from old.last_calibration_date) then
    raise exception 'Last calibration date cannot be in the future.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_equipment_calibration_not_future on public.equipment;
create trigger trg_equipment_calibration_not_future
  before insert or update on public.equipment
  for each row execute function public.trg_fn_equipment_calibration_not_future();

revoke execute on function public.trg_fn_equipment_calibration_not_future() from public, anon, authenticated;

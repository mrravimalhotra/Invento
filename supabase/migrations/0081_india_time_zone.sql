-- ============================================================
-- India time for every date the database works out (accuracy audit ACC-13 —
-- claude/app-accuracy-audit-2026-09-28.md; Ravi, 29 Sept 2026: "Start
-- Implementation").
--
-- The database ran on UTC, so between 00:00 and 05:30 IST it still thought
-- it was yesterday:
--   - a QC approved at 01:00 IST on 5 Oct got its retest date counted from
--     4 Oct (one day early);
--   - AR, PO and batch numbers created then carried the previous day — and
--     on 1 January, the previous year;
--   - "is this batch due for retest today" checks used yesterday's date;
--   - date filters without an explicit offset were read as UTC days.
--
-- Now the database's own time zone is India (Asia/Kolkata): current_date,
-- now()::date, to_char(now(), ...) and date filters all follow IST. Stored
-- timestamps don't change (they are absolute moments); only the calendar day
-- a moment is counted in does. The retest-date calculation is also written
-- with the time zone spelled out, so it can never depend on a session
-- setting.
--
-- Takes effect for new database connections (the API recycles its
-- connections within about 30 minutes; the SQL editor uses a new one).
-- ============================================================

begin;

do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Asia/Kolkata');
end $$;

-- The API connects as "authenticator"; set it there too so a role-level
-- setting can never override the database default. (Skipped quietly if this
-- project doesn't allow it.)
do $$
begin
  execute 'alter role authenticator set timezone to ''Asia/Kolkata''';
exception when others then
  raise notice '0081: could not set the time zone on role authenticator (%); the database default applies.', sqlerrm;
end $$;

-- Retest date = the IST day the QC was approved + the retest period.
create or replace function public.trg_fn_qc_compute_retest_date()
returns trigger
language plpgsql
as $$
begin
  if new.reviewed_at is not null and new.retest_period_days is not null then
    new.retest_date := ((new.reviewed_at at time zone 'Asia/Kolkata')::date
                        + (new.retest_period_days || ' days')::interval)::date;
  else
    new.retest_date := null;
  end if;
  return new;
end $$;

commit;

-- ============================================================
-- Security hardening bundle (Ravi, 28 Sept 2026:
-- "Implement SEC-10, SEC-01 part 2, SEC-12, SEC-09 (app part) and SEC-14").
-- See claude/security-bundle-decision.md. This migration holds the database
-- parts of SEC-01 part 2 and SEC-14; the rest is app code.
--
-- 1. SEC-01 part 2 — reading data needs at least one role.
--    Before: every business table's read policy was is_signed_in(), i.e.
--    any account with a login — including one with no roles, and a leaver
--    whose account was just disabled (roles removed, access token still
--    valid for up to an hour) — could read formulae, prices, QC and stock
--    straight through the API.
--    Now: has_app_access() = "signed in AND holds at least one role". All
--    read policies that used is_signed_in() use it instead, written as
--    (select public.has_app_access()) so Postgres evaluates it once per
--    query rather than once per row. Two small exceptions keep the
--    "Awaiting access" screen working for a role-less user: they can still
--    read their OWN profile row and their OWN (empty) role list.
--
-- 2. SEC-01 part 2, found while doing (1) — the five reporting views
--    (stock_balance, item_position, inventory_ledger_with_balance,
--    purchase_batch_status, production_batch_status) ran with their
--    owner's rights, which skips row level security entirely, and were
--    granted to the "anon" role. So stock quantities, the stock ledger and
--    batch QC status could be read with only the public API key, without
--    signing in. Now: security_invoker = on (the reader's own access rules
--    apply, i.e. (1) above), anon has no access, and signed-in users can
--    only SELECT from them.
--
-- 3. SEC-14 — batch QC check can no longer race a QC decision.
--    check_batch_qc_approved() (the "only QC-Approved batches can be used"
--    gate) read the batch's QC status without holding anything, so a batch
--    could be used in the same instant a QC Reviewer rejected it (or a
--    retest was opened) and both would succeed. Now the gate takes a shared
--    per-batch lock before reading, and any insert/update of that batch's
--    QC record takes the same lock exclusively. One waits for the other
--    (normally for a few milliseconds) and then sees the real status. Many
--    users can still use the same batch at once (shared locks don't block
--    each other).
--
-- Nothing else changes: write policies, role checks in functions, and the
-- screens users see (apart from the new "Awaiting access" page for a
-- signed-in user with no role, which is app code).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. has_app_access(): signed in and holds at least one role
-- ------------------------------------------------------------
-- security definer: it reads user_roles, whose own read policy uses it —
-- running as the owner avoids that loop (the owner is not subject to RLS).
create or replace function public.has_app_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid());
$$;

revoke all on function public.has_app_access() from public;
grant execute on function public.has_app_access() to anon, authenticated, service_role;

-- Every read-only policy whose rule is exactly is_signed_in() — 27 business
-- tables plus page_feedback — switches to has_app_access(). Found from the
-- catalogue rather than a hand-kept list, so none can be missed.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and cmd = 'SELECT'
       and qual = 'is_signed_in()'
       and tablename not in ('profiles', 'user_roles')
  loop
    execute format('alter policy %I on public.%I using ((select public.has_app_access()))',
                   r.policyname, r.tablename);
  end loop;
end $$;

-- A role-less user still sees their own name and their own (empty) roles,
-- which the "Awaiting access" screen shows.
alter policy profiles_select on public.profiles
  using ((select public.has_app_access()) or id = (select auth.uid()));
alter policy user_roles_select on public.user_roles
  using ((select public.has_app_access()) or user_id = (select auth.uid()));

-- Feedback: submitting also needs a role now (reading it already does via
-- the loop above).
alter policy page_feedback_insert on public.page_feedback
  with check ((select public.has_app_access()) and submitted_by = auth.uid());

-- ------------------------------------------------------------
-- 2. Reporting views: reader's own access rules, no anonymous access
-- ------------------------------------------------------------
do $$
declare
  v text;
begin
  foreach v in array array['stock_balance', 'item_position', 'inventory_ledger_with_balance',
                           'purchase_batch_status', 'production_batch_status']
  loop
    execute format('alter view public.%I set (security_invoker = on)', v);
    execute format('revoke all on public.%I from anon', v);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. SEC-14: batch QC gate and QC decisions take the same per-batch lock
-- ------------------------------------------------------------
create or replace function public._batch_qc_lock_key(p_purchase_line_id uuid, p_production_batch_id uuid)
returns integer
language sql
immutable
as $$
  select hashtext(coalesce(p_purchase_line_id::text, 'pb:' || p_production_batch_id::text));
$$;

create or replace function public.check_batch_qc_approved()
returns trigger language plpgsql as $$
declare
  v_status public.purchase_batch_status%rowtype;
  v_prod_status public.production_batch_status%rowtype;
begin
  if new.purchase_line_id is not null then
    -- SEC-14: wait for any QC decision on this batch that is being saved
    -- right now, and keep QC decisions on it waiting until this is saved.
    perform pg_advisory_xact_lock_shared(hashtext('batch-qc'),
                                         public._batch_qc_lock_key(new.purchase_line_id, null));

    select * into v_status
    from public.purchase_batch_status
    where purchase_line_id = new.purchase_line_id;

    if v_status.qc_status is distinct from 'approved' then
      raise exception 'Batch (purchase_line_id=%) is not QC-Approved and cannot be consumed', new.purchase_line_id;
    end if;

    if v_status.retest_date is not null and v_status.retest_date <= current_date then
      raise exception 'Batch (purchase_line_id=%) is due for retest (retest date %) and cannot be consumed until it is re-approved',
        new.purchase_line_id, v_status.retest_date;
    end if;

    return new;
  end if;

  if new.production_batch_id is not null then
    perform pg_advisory_xact_lock_shared(hashtext('batch-qc'),
                                         public._batch_qc_lock_key(null, new.production_batch_id));

    select * into v_prod_status
    from public.production_batch_status
    where production_batch_id = new.production_batch_id;

    if v_prod_status.qc_status is distinct from 'approved' then
      raise exception 'Batch (production_batch_id=%) is not QC-Approved and cannot be consumed', new.production_batch_id;
    end if;

    if v_prod_status.retest_date is not null and v_prod_status.retest_date <= current_date then
      raise exception 'Batch (production_batch_id=%) is due for retest (retest date %) and cannot be consumed until it is re-approved',
        new.production_batch_id, v_prod_status.retest_date;
    end if;

    return new;
  end if;

  return new;
end $$;

create or replace function public.trg_fn_lock_batch_qc()
returns trigger language plpgsql as $$
begin
  if new.purchase_line_id is not null or new.production_batch_id is not null then
    perform pg_advisory_xact_lock(hashtext('batch-qc'),
                                  public._batch_qc_lock_key(new.purchase_line_id, new.production_batch_id));
  end if;
  if tg_op = 'UPDATE'
     and (old.purchase_line_id is distinct from new.purchase_line_id
          or old.production_batch_id is distinct from new.production_batch_id)
     and (old.purchase_line_id is not null or old.production_batch_id is not null) then
    perform pg_advisory_xact_lock(hashtext('batch-qc'),
                                  public._batch_qc_lock_key(old.purchase_line_id, old.production_batch_id));
  end if;
  return new;
end $$;

-- "trg_00_" so it runs before the other QC triggers (alphabetical order).
drop trigger if exists trg_00_lock_batch_qc on public.quality_checks;
create trigger trg_00_lock_batch_qc
  before insert or update on public.quality_checks
  for each row execute function public.trg_fn_lock_batch_qc();

-- ------------------------------------------------------------
-- Self-check: no read policy may still rely on is_signed_in() alone
-- ------------------------------------------------------------
do $$
declare
  v_left text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into v_left
    from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') like '%is_signed_in()%' or coalesce(with_check, '') like '%is_signed_in()%');
  if v_left is not null then
    raise exception '0075: policies still using is_signed_in(): %', v_left;
  end if;
end $$;

commit;

#!/bin/bash
# Runs the database regression suites in supabase/tests against a fresh local
# Postgres build of ALL migrations, and prints one line per suite.
#
#   scripts/dev/run-tests.sh            # every suite
#   scripts/dev/run-tests.sh sec04 b    # only suites whose file name starts with these
#
# Needs a local Postgres you can reach with `sudo -u postgres psql`
# (sandbox: `service postgresql start`). Nothing touches Supabase.
#
# How it works: rebuilds supabase/fresh-install.sql (all migrations in the
# right order), loads it once into a template database, then copies the
# template per suite so suites cannot disturb each other. Each copy gets the
# production time zone (Asia/Kolkata), because `create database ... template`
# does not carry the setting that migration 0081 applies.
#
# Expected results live in supabase/tests/expected.txt ("<suite> <pass> <fail>").
# A line reads OK when it matches; DIFF shows what changed. Exit code 1 on any DIFF.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$ROOT/supabase/tests"
PSQL="sudo -u postgres psql -X -q"
TPL=invento_tpl

node "$ROOT/scripts/build-fresh-install.mjs" >/dev/null || { echo "could not build fresh-install.sql"; exit 2; }

$PSQL -c "drop database if exists $TPL" -c "create database $TPL" >/dev/null 2>&1
for r in anon authenticated service_role; do
  $PSQL -c "do \$\$ begin create role $r nologin; exception when duplicate_object then null; end \$\$;" >/dev/null 2>&1
done
$PSQL -d $TPL -v ON_ERROR_STOP=1 -f "$ROOT/scripts/dev/auth_stub.sql" >/dev/null 2>&1
if ! $PSQL -d $TPL -v ON_ERROR_STOP=1 -f "$ROOT/supabase/fresh-install.sql" >/dev/null 2>"$TPL.err"; then
  echo "MIGRATIONS FAILED:"; tail -5 "$TPL.err"; rm -f "$TPL.err"; exit 2
fi
rm -f "$TPL.err"

# suite name -> file (sb also needs its seed and the t_check helper first)
declare -A FILE=(
  [b]=b_batch_numbers_retests [p]=p_packaging [r]=r_po_reopen [u]=u_single_unit
  [sec04]=sec04_workflow_guards [des02]=des02_audit_trail [tz]=tz_india_time
  [sec07]=sec07_last_admin [sb]=sb_security_reads
  [a0085]=part_a_0085_form_fixes [a0086]=part_a_0086_db_hardening [a0087]=part_a_0087_indexes_codes
)
ORDER=(b p r u sec04 des02 tz sec07 sb a0085 a0086 a0087)
HELPER="create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as \$\$ begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end \$\$;"

bad=0
for s in "${ORDER[@]}"; do
  if [ $# -gt 0 ]; then
    keep=0; for a in "$@"; do [[ "$s" == "$a"* || "${FILE[$s]}" == "$a"* ]] && keep=1; done
    [ $keep -eq 0 ] && continue
  fi
  DB="invento_t_$s"
  $PSQL -c "drop database if exists $DB" -c "create database $DB template $TPL" -c "alter database $DB set timezone to 'Asia/Kolkata'" >/dev/null 2>&1
  if [ "$s" = "sb" ]; then
    out=$($PSQL -d $DB -f "$T/sb_seed.sql" 2>&1; $PSQL -d $DB -c "$HELPER" -f "$T/${FILE[$s]}.sql" 2>&1)
  else
    out=$($PSQL -d $DB -f "$T/${FILE[$s]}.sql" 2>&1)
  fi
  p=$(echo "$out" | grep -c "PASS"); f=$(echo "$out" | grep -c "FAIL"); e=$(echo "$out" | grep -c "ERROR")
  exp=$(grep "^$s " "$T/expected.txt" 2>/dev/null | head -1)
  if [ -z "$exp" ]; then status="NEW (no expected line)"; elif [ "$exp" = "$s $p $f" ] && [ "$e" -eq 0 ]; then status=OK; else status="DIFF (expected: ${exp#* })"; bad=1; fi
  echo "$s: pass=$p fail=$f err=$e  $status"
  if [ "$status" != "OK" ]; then echo "$out" | grep -E "FAIL|ERROR" | head -3 | cut -c1-200; fi
  $PSQL -c "drop database if exists $DB" >/dev/null 2>&1
done
$PSQL -c "drop database if exists $TPL" >/dev/null 2>&1
exit $bad

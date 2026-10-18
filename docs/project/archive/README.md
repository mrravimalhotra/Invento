# Archive: historical scripts (not for the live database)

Everything here was written to find or prove a problem at a point in time. None of it should be run on the live database. The current read-only checks are `scripts/sql/live-data-checks.sql`.

| File | What it was |
|---|---|
| `audit-impact-check.sql` | One-off impact check for the 28 Sept 2026 accuracy audit. No longer runs (refers to a column dropped in migration 0079). |
| `scan-sql/scan-evidence-p1.sql` to `p10.sql` | Reproductions of each full-app scan finding, one file per phase. They run on a scratch copy of the local test database built from `supabase/fresh-install.sql` and `scripts/dev/auth_stub.sql`, and print ALLOWED or REFUSED lines. The findings they prove are listed in `docs/project/scan/scan-findings-pN.md`; most are now fixed. |
| `scan-sql/working/` | The scan's smaller working scripts: concurrency pairs (`conc_*`), per-step probes (`pNN_*.sql`) and performance generators (`perf_*.sql`). |

Not copied here, on purpose: `task_f_live_test_cleanup.sql` (destructive, hard-coded ids, already run on 3 Sept 2026) and `backup-before-purge-2026-09-13.sql` (a copy of every table; stays in the Claude project).

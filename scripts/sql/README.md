# scripts/sql

Read-only SQL that is run by hand in the Supabase SQL Editor. Nothing here is a migration and nothing here changes data.

## live-data-checks.sql

97 `SELECT` blocks that look at the stored data and report what is wrong or unusual. They were written during the full-app scan (10 to 11 Oct 2026) and brought up to date for migration 0120 (finished product retest) on 18 Oct 2026.

- **P1 to P10 blocks** show what is stored today for one scan phase (privileges, constraints, data shapes, numbers, limits). Each block's comment says what a healthy result looks like.
- **INV- blocks** are the invariants (stock S, quality control Q, production P, packaging K). They return rows only when something is wrong. No rows means good.

How to run: open the Supabase SQL Editor, paste ONE block (everything between two `-- ## ` lines), press Run. Large results are limited to 50 to 200 rows. No block takes locks, but the INV- blocks read the whole ledger, so run them off-hours once the database is large.

When to run: after each release that touches stock, QC, production or packaging; before go-live; and after the opening stock load.

Every block was run against an empty database built from `supabase/fresh-install.sql` to confirm that it parses and every column exists. An empty database returns no rows, so a new migration that renames or drops a column will show up here as an error: fix the block in the same change.

Known caveat: a finished product batch whose retest was rejected (its bulk is taken out of On hand) can appear in INV-S8 until someone looks at it. That is expected.

## Deliberately not kept here

- The four `scan-invariants-*.sql` files: their checks are merged into `live-data-checks.sql`.
- `scan-evidence-p*.sql`: reproductions of bugs that are now fixed. They are in the project documents if ever needed.
- The 13 Sept 2026 backup-before-purge script and the one-off test-data clean-up script: they hold hard-coded ids or real rows and are destructive or stale.

The Stock Integrity Check (S1 to S9) is not a script: it is the function `stock_integrity_check` and the screen under Admin.

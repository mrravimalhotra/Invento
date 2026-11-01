## REQ-05 — Every packaging issue is a pack; the database accepts only `pack`

> "Every issue is a **pack**; the database accepts only `pack`."
> — docs/modules/packaging.md · Current behaviour, bullet 2 (L7)

**Verdict:** implemented · confidence: high

**What this demands of an implementation:** no write path (screen, action, RPC, direct table insert by a permitted role, opening-stock load) can store a `packaging_issues` row whose `transaction_type` is anything but `pack`.

**Where enforcement lives:**

```sql
-- supabase/migrations/0079_packaging_fp_integrity.sql:L52-L55
alter table public.packaging_issues drop constraint if exists packaging_issues_transaction_type_check;
alter table public.packaging_issues
  add constraint packaging_issues_transaction_type_check check (transaction_type = 'pack') not valid;
alter table public.packaging_issues alter column transaction_type set default 'pack';
```
- Database: a CHECK constraint on the table, so it applies to every insert (RPC or direct insert under the `packaging_insert` RLS policy, 0001_init.sql:L568-L569) and to every update of a row.
- `create_packaging_issue()` (latest 0092_packaging_issue_date.sql:L24-L66) writes the literal `'pack'` (L52) and ignores any `transaction_type` in its JSON; `create_packaging_issues()` (0093) and `create_production_issues()` (0095) only call it.
- Opening-stock loads insert `'pack'` (0120_finished_product_retest.sql:L1005; earlier 0101:L205).
- App: no TypeScript/TSX file in the app references `transaction_type`; the form has no transaction-type field (app/(dashboard)/packaging/packaging-form.tsx:L71-L73 comment records its removal).

**Paths walked:**
- New issue from the screen → action → `create_packaging_issues` / `create_production_issues` → `create_packaging_issue` → `'pack'`. ✓
- Direct `insert into packaging_issues (..., transaction_type) values (..., 'unpack')` by a packaging role → CHECK fails. ✓ (supabase/tests/p_packaging.sql:L69, "an Unpack record is refused")
- Opening-stock load → `'pack'`. ✓
- Existing pre-0079 rows with `repack` / `unpack`: `not valid` leaves them in place. They are history, not accepted writes, so the sentence still holds for new data. But PostgreSQL checks a NOT VALID CHECK constraint on every later UPDATE of a row, whatever column changes. `void_packaging_issue()` (latest 0127_void_review_fixes.sql:L172-L175) updates the issue row, so voiding a legacy `repack`/`unpack` issue fails with a check violation (23514) and the whole void rolls back. The `unpack` branch at 0127:L151 (reverse the packed count with the opposite sign, 0127 fix 4) therefore cannot complete for any row it was written for. ✗ (side effect on REQ-01, not on this requirement)

**Searched:**
- `transaction_type_check|validate constraint` in migrations → only 0079:L52-L54 for this constraint (the one `validate constraint` hit is a comment in 0016:L18); the constraint was never re-created or validated.
- `transaction_type` in migrations → 0001:L561 (original `pack/repack/unpack`), 0002/0027/0050 (packed-count sign), 0079 (constraint, insert), 0092:L42 (insert), 0101:L203 and 0120:L1003 (opening load), 0127:L151 (void sign).
- `transaction_type|transactionType` in `lib`, `app`, `components` (*.ts, *.tsx) → 0 hits.
- `unpack|repack` in supabase/tests → only p_packaging.sql (the refusal test); no test voids a legacy unpack/repack row.

**How the verdict was reached:** the database refuses every new non-`pack` value on every write path and the app never offers one, so the requirement holds. The legacy-row conflict with void does not let a non-`pack` value in; it makes the 0127 `unpack` handling dead and blocks voiding such rows. That belongs to the Void requirement and the 0127 notes, so it is recorded here as a related finding (low: all data is test data and whether any legacy unpack/repack rows exist cannot be checked from the code).

**Open questions:**
- Do any `repack` / `unpack` rows exist in the live database? If yes, voiding them fails with a check-violation error (the message depends on `friendlyDbError`'s 23514 case, lib/db-errors.ts:L87) instead of "void at any time" as REQ-01 says. Either convert those rows to `pack` in a migration (and drop the 0127:L151 branch) or say in packaging.md that legacy unpack/repack issues cannot be voided.

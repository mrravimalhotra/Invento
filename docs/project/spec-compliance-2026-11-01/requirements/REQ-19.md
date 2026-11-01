## REQ-19 — Analytical Report No. formats (ARRM / ARFP, old numbers kept)

> "Analytical Report No. format: `ARRM-0001/26` (raw material) and `ARFP-0001/26` (finished product); older `AR-001-DDMMYYYY` numbers are unchanged."
> — docs/modules/qc.md · bullet 7

**Verdict:** implemented · confidence: high

---

**What this demands of an implementation:** every newly issued AR number for a raw-material QC record (purchase
batch, Production RM-FP batch, RM retest) has the form `ARRM-<at least 4 digits>/<2-digit year>`; every new
finished-product AR number has the form `ARFP-…/yy`; the two types count separately; numbers already stored in the
old `AR-001-DDMMYYYY` form are not rewritten.

---

**Where enforcement lives:**

```sql
-- supabase/migrations/0099_ar_number_format.sql:L23-L45 (only definition of _next_ar_number)
v_yy := to_char(now() at time zone 'Asia/Kolkata', 'YY');
if p_kind not in ('RM', 'FP') then raise exception ...
v_seq := 'ar_' || lower(p_kind) || '_' || v_yy || '_seq';
execute format('create sequence if not exists public.%I start 1', v_seq);
execute format('select nextval(%L)', 'public.' || v_seq) into v_n;
return 'AR' || p_kind || '-' || public._pad_seq_code(v_n::text, 4) || '/' || v_yy;
```
- `get_next_ar_number()` = `_next_ar_number('RM')` (0099:L48-L53); `get_next_fp_ar_number()` = `_next_ar_number('FP')`
  (0099:L55-L60). Both are the latest definitions (earlier `get_next_ar_number` in 0001:L281 and 0069:L115 are
  superseded). One sequence per type and year, so RM and FP count separately and restart each year (IST).
- `_pad_seq_code` (0069) pads to a minimum width; past 9999 it widens to `ARRM-10000/yy` (tested,
  `supabase/tests/fb59_ar_number_format.sql:L36-L43`).
- `_next_ar_number` is not callable by signed-in users (0099:L46, test fb59:L48).

**Paths walked (every writer of `quality_checks.ar_number`):**
- New AR on a purchase batch: `lib/actions/qc.ts:L73` calls `get_next_ar_number` → insert L76-L80. ARRM ✓
- New AR on a Production RM-FP batch: `lib/actions/qc.ts:L512` → insert L515-L519. ARRM ✓
- RM retest: `start_retest()` latest create `0112_qc_integrity_and_coa_company.sql:L303` (0114:L215 only alters its
  timezone) uses `get_next_ar_number()`. ARRM ✓
- FP first submission: `submit_fp_batch_to_qc()` latest `0099:L67-L112`, L91 `get_next_fp_ar_number()`. ARFP ✓
- FP retest: `start_fp_retest()` `0120_finished_product_retest.sql:L203` `get_next_fp_ar_number()`. ARFP ✓
- Opening stock RM: `load_opening_stock()` `0100_opening_stock.sql:L270-L279` keeps the typed old number, refuses a
  number that matches `^AR(RM|FP)-[0-9]+/[0-9]{2}$` and refuses a duplicate. Old form preserved ✓
- Opening stock FP: `load_opening_finished_product()` latest `0120:L937-L946` (same rule, case-insensitive `~*`). ✓
- 0068:L366 backfill (one-off `do` block at migration time) — historical, not a live path.
- Old numbers unchanged: 0099 contains no `update` of `quality_checks`; no migration assigns `ar_number` on update
  (search below). ✓

---

**Searched:**
- `ARRM\|ARFP` in migrations → only 0099 (definition/comments); also in tests fb59, os100, os101, fr120, glossary,
  user guide, opening-stock template.
- `get_next_ar_number\|get_next_fp_ar_number\|_next_ar_number` in migrations/lib/app → callers listed above
  (0068:L366, 0080:L282 superseded by 0112:L303, 0085:L55 superseded by 0099:L91, 0112:L303, 0120:L203,
  lib/actions/qc.ts:L73, L512).
- `insert ... (ar_number` in migrations → 0068, 0080, 0085, 0099, 0100, 0101, 0112, 0120 — all accounted for.
- `ar_number is distinct\|new.ar_number` in migrations → 0 hits (no trigger locks or rewrites the column).
- `check (...ar_number` / regex on `ar_number` in a constraint → 0 hits; the column is `text not null unique`
  (0001_init.sql:L288).
- `qc_insert` policy → 0003_fixes.sql:L12-L13 (roles system_admin, inventory_manager, quality_checker, qc_reviewer,
  mfr_manager; no column check). `qc_update` → 0001:L317-L319.

---

**How the verdict was reached:** every live path that issues a new number calls the 0099 generator, which produces
exactly the documented forms with separate per-type counters; the only paths that keep a non-app number are the
opening-stock loaders, which is what "older numbers are unchanged" covers. Not `stronger-than-spec`: nothing beyond
the statement is enforced. Not `partial`: no live path issues a number in another format.

Side note (no behavioural consequence for the app): the format is produced, not enforced. The database has no
check constraint on `ar_number` and `trg_fn_qc_enforce_review_stages` (latest 0126:L29-L56) returns early when the
status does not change, so a holder of `qc_insert`/`qc_update` writing directly through PostgREST could store or
change an AR number to any unique string. That needs a QC/inventory role and bypasses the app; severity low.

**Open questions:**
- The document gives only the 4-digit example; it does not say numbers widen to 5 digits after 9999 (0099:L9-L10).
  Documentation could say so.
- The RM opening-stock check is case-sensitive (`~`, 0100:L274) while the FP one is case-insensitive (`~*`,
  0120:L941), so `arrm-0001/26` is accepted as an old RM number. Cosmetic.

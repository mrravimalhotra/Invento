## REQ-17 — Round 2 approval: expiry date, retest period (180-day max, pre-filled), 3 retests, pre-fills

> "Round 2 approval needs an **Expiry date** (not before today) and, except on the last retest, a **Retest period**. Raw material: period pre-filled at 180 days (the maximum), at most **3 retests**; the 3rd retest takes only the Expiry date. The sample quantity is pre-filled on New AR; the expiry is not."
> — docs/modules/qc.md · Current behaviour, bullet 4

**Verdict:** partial · confidence: high

**What this demands of an implementation:**
1. A Round 2 approval (`checker_approved` -> `approved`) is refused without `expiry_date`, and refused when `expiry_date < today (IST)`.
2. It is refused without `retest_period_days`, except when this record is the last allowed retest, where a period is refused.
3. `retest_period_days <= 180`; the field is pre-filled with 180.
4. A batch gets at most 3 retests (opening-stock `legacy_retests_done` counts); on the 3rd only an expiry is taken.
5. New AR pre-fills the sample quantity and does not pre-fill (or take) an expiry.

**Where enforcement lives:**

```ts
// lib/actions/qc.ts:L217-L228  (reviewQcRound2)
const retestPeriodRaw = formData.get("retest_period_days");
const retestPeriodDays = retestPeriodRaw ? Number(retestPeriodRaw) : null;
if (retestPeriodRaw && (... || retestPeriodDays <= 0)) return { error: "Retest period must be a positive whole number of days." ... };
const expiryRaw = String(formData.get("expiry_date") || "").trim();
if (status === "approved") {
  if (!expiryRaw) return { error: "Expiry date is required to approve a batch." ... };
  const expiryError = beforeDateError(expiryRaw, todayIst(), "Expiry date", "today");
```

```ts
// lib/actions/qc.ts:L257-L270, L296-L302
if (retestPeriodDays !== null && retestPeriodDays > MAX_RM_RETEST_DAYS) return { error: `Retest period can be at most ...` };
let finalRetest = false;
if (existing.is_retest) { const retestsDone = await countRetestsDone(...); finalRetest = retestsDone >= MAX_RM_RETESTS; }
...
if (finalRetest && retestPeriodRaw) return { error: `This was the last retest allowed ...` };
if (!finalRetest && !retestPeriodRaw) return { error: "Retest period (days) is required to approve a batch." ... };
```

```ts
// lib/actions/qc.ts:L447-L451  (startRetest, shared by RM, Production RM and FP)
const retestsDone = await countRetestsDone(supabase, batch);
if (retestsDone >= MAX_RM_RETESTS) return { error: `This batch has already been retested ${MAX_RM_RETESTS} times, which is the maximum.` };
```

- Constants: `lib/constants/qc-rules.ts:L4-L5` (`MAX_RM_RETEST_DAYS = 180`, `MAX_RM_RETESTS = 3`).
- `countRetestsDone` (`lib/qc-retests.ts:L7-L24`) = count of `quality_checks` rows with `is_retest = true` for the batch (the record under review included) + `legacy_retests_done` of the opening-stock record. So on the 3rd retest record the count is 3 and `finalRetest` is true.
- Screen: `app/(dashboard)/qc/[id]/page.tsx:L82-L98` computes `isFinalRetest` the same way; `L283-L287` passes `maxRetestDays = defaultRetestDays = 180`. `qc-reviewer-form.tsx:L40` pre-fills 180 unless final; `L114-L123` expiry input `min={today}`, `required`; `L129-L133` final retest shows no period field; `L147-L157` period input `min=1 max=180 step=1`; `L57-L58` disables approve without expiry / period.
- New AR: `app/(dashboard)/qc/new/qc-assign-form.tsx:L30-L43` pre-fills the sample quantity from `purchase_lines.qc_qty` (converted to the item's default sample unit); the form has no expiry field at all (L133-L150 is sample quantity / unit). `lib/actions/purchase.ts:L456-L462` records that `purchase_lines.expiry_date` is no longer collected on purchase.

**Database layer:** none of rules 1-4 is enforced by the database.
- The final stage trigger `trg_fn_qc_enforce_review_stages` (latest: `supabase/migrations/0126_void_packaging_issue.sql:L29`, Round 2 branch L81-L121) checks role, different person, reason and results only; no reference to `expiry_date` or `retest_period_days` on approval.
- `supabase/migrations/0112_qc_integrity_and_coa_company.sql:L10-L12` and `0120_finished_product_retest.sql:L6-L7` state the 180-day / 3-retest / final-retest rules are "in the app" / "applied in the QC screen".
- RLS `qc_update` (`supabase/migrations/0001_init.sql:L317-L319`, never redefined) lets `system_admin`, `quality_checker`, `qc_reviewer` UPDATE `quality_checks` directly through PostgREST.
- Indirect cap: `start_retest()` (`0112:L263-L265`) and `start_fp_retest()` (`0120:L163-L165`) refuse a retest when the latest approval has `retest_date is null`; `retest_date` is null when `retest_period_days` is null (`0081_india_time_zone.sql:L49-L54`). So a 4th retest is blocked in the database only if the 3rd approval really had no period.
- `retest_period_days` is `integer` (`0001_init.sql:L299`) with no CHECK constraint.

**Paths walked:**
- Screen -> `reviewQcRound2`, first approval (not retest): expiry required and >= today (L224-L228), period required (L300-L302), <= 180 (L257). ✓
- Screen -> `reviewQcRound2`, retest 1 or 2: `finalRetest` false, same checks. ✓
- Screen -> `reviewQcRound2`, retest 3 (or legacy batch whose done + new = 3): `finalRetest` true; a period is refused (L297-L299), expiry still required. ✓
- `startRetestQualityCheck` / production / `startFpRetestQualityCheck` -> `startRetest`: refused at count >= 3 (L448-L451). ✓
- Direct PostgREST `update quality_checks set status='approved', expiry_date=null|<past>, retest_period_days=365 ...` by a QC Reviewer: the stage trigger passes it, `trg_qc_retest_within_expiry` (0120:L327-L347) skips when `expiry_date` is null and only compares the period to the expiry otherwise; no 180, today or final-retest check. ✗
- Direct PostgREST update setting a period on the 3rd retest: then `retest_date` is set, the batch shows as due again, and only the app's `startRetest` count check (L448) stops a 4th retest; `start_retest()` itself does not count retests. ✗ (DB)
- Period "1.5": action check L219 tests only `> 0` and finite, not integer; the screen has `step=1` (form L153); a direct POST would hit the integer column and come back as a generic `friendlyDbError`. Minor.

**Searched:**
- `retest|180|MAX_RM_RETEST` in `lib/actions/qc.ts` -> L217-L313 (Round 2), L447-L451 (start retest); no other writer of `retest_period_days` in `lib/actions/`.
- `MAX_RM_RETEST|countRetestsDone` in `lib/ app/ components/` -> qc-rules.ts L4-L5, qc.ts, qc-retests.ts, opening-stock/validate.ts L206/L330/L333, qc/[id]/page.tsx L14-L15/L93-L98/L283-L284.
- `retest_period_days|expiry_date` in `supabase/migrations/*.sql` (excluding comments) -> only 0081 compute trigger, 0098 views/gates, 0100/0101/0120 opening-stock inserts, 0112/0126 void clears, 0120 within-expiry trigger; no approval-time required/today/180 check.
- `180|3 retest|retests|final retest|later expiry` in migrations 0098, 011x, 012x -> 0098 header, 0112 L11 ("in the app"), 0120 L6-L7 ("applied in the QC screen"), 0120 opening-stock L917-L933.
- `trg_fn_qc_enforce_review_stages` definitions -> 0054, 0119, 0126 (latest, L29); body has no expiry/retest checks.
- `policy ... quality_checks` -> 0001 L314-L319, 0003 L11-L12 (insert only); `qc_update` unchanged since 0001.
- `_is_direct_client_write` with quality/qc -> 0112 L142 only (purchase_lines guard), none on `quality_checks`.
- `expiry` in `app/(dashboard)/qc/new/*` -> 0 hits in qc-assign-form.tsx / page.tsx.
- Tests: `supabase/tests/part_fb58_expiry.sql`, `part_fr120_fp_retest.sql` (expected `fb58 14 0`, `fr120 67 0`); no unit test in `tests/` references `reviewQcRound2` or `MAX_RM_RETEST`.

**How the verdict was reached:** Every rule in the sentence holds on the screen and in the server action, for raw material, Production raw material and finished product, so it is not `contradicted`. It is `partial` rather than `implemented` because the database, which the brief treats as the stronger layer and which this project uses for its other QC guards, enforces none of: expiry required, expiry >= today, period required, period <= 180, no period on the final retest. RLS lets the three QC roles write `quality_checks` directly, and the stage trigger lets such a write through. Severity medium: it takes a privileged QC role using the API outside the app, and the audit trail (0058) records it; the consequence is a GMP batch released with no expiry, a past expiry or a period longer than 6 months, or one extra retest cycle.

**Document problems:** "Raw material: period pre-filled at 180 days" is narrower than the code, which pre-fills 180 for every batch type (page.tsx L284). REQ-18 says FP has the same cycle, so the two bullets agree but this one reads as RM-only. "the expiry is not [pre-filled]" is true of New AR, which has no expiry field. On Round 2 the expiry *is* pre-filled: on a retest with the last approved expiry (page.tsx L99-L108), and for an opening-stock Pending QC batch with its manufacturer expiry (L110-L111). A reader could take the sentence to mean Round 2 never pre-fills.

**Open questions:**
- Is app-only enforcement of the 180 / 3-retest / today rules a deliberate decision (0112 L10-L12 suggests so) that should be recorded in qc.md, or should a trigger enforce them like `trg_qc_retest_within_expiry`?
- `countRetestsDone` counts every `is_retest` row, including rejected retests. A rejected-then-voided retest that is re-approved counts once (it is the same row), so the count holds; whether a rejected retest should use up one of the 3 is not stated anywhere.

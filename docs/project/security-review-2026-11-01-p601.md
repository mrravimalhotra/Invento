# Security review of P6-01 (void a packaging issue), 1 Nov 2026

The built-in `security-review` skill could not start in this checkout (it compares the branch with `origin/HEAD`, which is not set, and the branch equals `main`, so its diff would be empty). The same review was done by hand on the changes since the last security pass (`2f9524a`): migrations 0126 and 0127, the Packaging screens and the server action, plus the app code they touch. Read-only checks on the live database confirmed the grants.

## Result: no high or medium findings

| Area | Checked | Result |
|---|---|---|
| Who can void | `void_packaging_issue` checks `has_any_role('system_admin','inventory_manager')` before reading anything; the server action checks `canWrite(..., "packaging_void")` too. Live: EXECUTE for `authenticated` only (plus postgres/service_role); `anon` cannot call it. | OK |
| Direct table writes | `packaging_issues` has no update policy, so voided_at / active / fp_qty_consumed can be changed only through the function (suite vp126: a direct update changes nothing). | OK |
| QC "voided" status | Only reachable when the transaction-local setting `invento.voiding` is on. Only `void_packaging_issue` sets it (fixed value, reset after use); no function a user can call sets session settings, and PostgREST does not expose `set_config`. A voided record can never change again. | OK |
| New trigger function | `trg_fn_qc_production_batch_active` is SECURITY DEFINER with a fixed search_path; EXECUTE revoked from public, anon, authenticated (triggers need none). | OK |
| search_path | Every function 0126/0127 redefined has a fixed search_path (self-checks in both migrations). `item_position` keeps `security_invoker = on` (0126 self-check; the `sb` suite caught its loss before delivery). | OK |
| Race with a finished product batch drawing the RM-FP batch | The void locks the RM-FP batch rows (FOR UPDATE) and checks for use after the lock; a draw updates the same row. Either order ends safely: void after a draw is refused; a draw after a void fails the non-negative remaining check. | OK |
| Injection | All SQL is static plpgsql with parameters; the reason is stored as text and written to the ledger reason, never executed. The app renders it as React text (no HTML). The Excel export writes plain string cells (exceljs), so a reason starting with "=" cannot become a formula. | OK |
| Error messages | Name the issue code or RM-FP batch only; no internal details. | OK |

## Low finding (not fixed; for Ravi to decide)

| # | Finding | Suggestion |
|---|---|---|
| L1 | The void reason has no length limit (the ledger copy is cut to 500 characters, the issue's own `void_reason` is not). Only Inventory Managers and System Admins can void, so the risk is a very long text, not a breach. | Cap it at 2,000 characters like other notes (`TEXT_MAX`), in the action and with a database check (migration 0128). |

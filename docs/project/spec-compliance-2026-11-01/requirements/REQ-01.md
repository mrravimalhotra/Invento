## REQ-01 — Who can void a packaging issue, with a reason, from the Packaging list

> "an Inventory Manager or System Admin can void an issue with a reason, at any time, from the Packaging list (Status column → Void → red box → Yes, void)."
> — docs/modules/packaging.md · Current behaviour, bullet 1 (Void)

**Verdict:** implemented · confidence: high

---

**What this demands of an implementation:**
- Only roles `inventory_manager` and `system_admin` can void; every other signed-in role, and anon, is refused.
- A reason is required (the module elsewhere uses a 3-character minimum).
- No time or status window ("at any time"): an issue can be voided regardless of age or FP batch state, except where REQ-04 (Production issues) adds its own refusal.
- The UI path: Packaging list → Status column → Void link → red confirmation box with a reason → "Yes, void".

---

**Where enforcement lives:**

```sql
-- supabase/migrations/0127_void_review_fixes.sql:L58-L85 (latest definition of void_packaging_issue)
security definer
...
  if not public.has_any_role('system_admin', 'inventory_manager') then
    raise exception 'Only an Inventory Manager or System Administrator can void a packaging issue.' using errcode = 'P0001';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Give a reason of at least 3 characters.' using errcode = 'P0001';
  end if;
  select * into v_issue from public.packaging_issues where id = p_id for update;
  ...
  if v_issue.voided_at is not null then
    raise exception 'Packaging issue % is already void.' ...
```
- Grants: `revoke all ... from public, anon; grant execute ... to authenticated` at 0126_void_packaging_issue.sql:L406-L407. 0127 uses `create or replace` (0127:L58), which keeps the existing ACL; 0127:L178 re-sets `search_path`.
- The role check runs first, so no other role reaches any write. The reason is trimmed (0127:L66) before the length check.
- The only refusals besides role/reason are: issue not found (L80-L82), already void (L83-L85), and the Production RM-FP-batch-used check (L88-L100, REQ-04). There is no date, age, FP-batch-status or QC-status condition: "at any time" holds.
- Direct table writes cannot void: `packaging_issues` has only a SELECT and an INSERT policy (0001_init.sql:L567-L569); no UPDATE or DELETE policy exists in any migration, so a PostgREST `update ... set voided_at` affects 0 rows.

Server action:
```ts
// lib/actions/packaging.ts:L430-L444
export async function voidPackagingIssue(id: string, _prev: ActionState, formData: FormData) {
  if (!canWrite(user?.roles ?? [], "packaging_void")) { return { error: "Your role can't do this. ..." }; }
  const reason = String(formData.get("void_reason") || "").trim();
  const reasonProblem = reasonError(reason, "A reason");
  ...
  const { error } = await supabase.rpc("void_packaging_issue", { p_id: id, p_reason: reason });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/packaging"); ...
  return { success: "Packaging issue voided. Stock has been put back." };
```
- `packaging_void: ["system_admin", "inventory_manager"]` at lib/constants/roles.ts:L48: the same role set as the database.
- `reasonError` refuses fewer than `MIN_REASON_CHARS = 3` characters (lib/qc-results.ts:L7-L15): the same minimum as the database.

Screen:
- app/(dashboard)/packaging/page.tsx:L43 computes `canVoid` from the same `packaging_void` key; L89 passes it to the table.
- app/(dashboard)/packaging/packaging-table.tsx:L120-L149: the "Status" column shows a red "Void" button (L139-L146) only when `canVoid` and the row is not voided; a voided row shows the badge instead.
- packaging-table.tsx:L196-L200: clicking opens `VoidIssueBox` under the row (`rowAfter`).
- app/(dashboard)/packaging/void-issue-box.tsx:L34: red box (`border-red bg-red-bg`); L49: required reason `Textarea` with `minLength={MIN_REASON_CHARS}`; L52-L54: "Yes, void" submit; L55-L57: Cancel. It uses `useFlashActionState` (L23), so the result message is shown, as CLAUDE.md requires.

---

**Paths walked:**
- Inventory Manager / System Admin → Void → reason ≥3 → action passes (roles.ts:L48, qc-results.ts:L11) → RPC passes the role and reason checks → void written. ✓
- MFR Manager (or any other role) → no Void button (packaging-table.tsx:L139 is behind `canVoid`); a forged POST to the action → refused at packaging.ts:L432; a direct RPC call → refused at 0127:L72-L74. ✓
- anon → no EXECUTE (0126:L406). ✓
- Reason of 0-2 characters → blocked by the browser (`minLength`), the action (L436-L437) and the database (0127:L75-L77). ✓
- Old issue / any FP batch state → no condition refuses it (0127:L72-L100). ✓
- Already voided issue → no Void button (L123 branch); the RPC refuses at 0127:L83-L85. ✓
- Two people voiding at once → `for update` on the issue row (0127:L79) serialises them; the second gets "already void". ✓
- Direct `update packaging_issues set voided_at = ...` by a client → no UPDATE policy, 0 rows. ✓

---

**Searched:**
- `void_packaging_issue` in supabase/migrations → 2 files: 0126 (first definition + grants), 0127 (latest definition).
- `packaging_void` in lib/ and app/ → roles.ts:L48, packaging/page.tsx:L43, actions/packaging.ts:L432.
- `on public.packaging_issues` policies in all migrations and fresh-install.sql → `packaging_select` and `packaging_insert` only (0001:L567-L569; fresh-install.sql:L586-L587); no update/delete policy.
- `grant execute on function public.void_packaging_issue` → 0126:L407 only.
- `revoke .* from authenticated` in 0124_function_access_hardening.sql → a loop over listed functions (L27) and three named functions (L31-L33); void_packaging_issue is not among them (0124 predates it).

---

**How the verdict was reached:** all three layers enforce the same role set and the same 3-character reason minimum; the database is the authoritative check, runs before any write, and is reachable only by `authenticated`. No condition limits when an issue can be voided apart from REQ-04's Production rule, which the same bullet states. The UI path matches the described sequence element by element.

---

**Open questions:**
- The action does not validate `id` with zod (CLAUDE.md convention). A malformed id reaches the RPC and fails as a cast error mapped to a generic message by `friendlyDbError`; no behaviour consequence.
- A separate path can create a row that *looks* voided without this function: see REQ-03 (direct INSERT with `voided_at` set). That does not let anyone void an existing issue, so it is not counted against REQ-01.

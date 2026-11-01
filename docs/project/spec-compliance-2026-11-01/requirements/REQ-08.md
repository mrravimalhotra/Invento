## REQ-08 — Save asks once more in a red box; "cannot be undone yet"

> "**Save issue(s)** asks once more in a red box ("Yes, save" / Cancel) before it saves, since a saved issue cannot be undone yet."
> — docs/modules/packaging.md · Current behaviour, bullet 5 (full line ends "(UX-13, 25 Oct 2026)", docs/modules/packaging.md:L10)

**Verdict:** implemented · confidence: high

**What this demands of an implementation:**
1. On the New packaging issue page, the save button does not submit on first click; it opens a red box with "Yes, save" (submits) and "Cancel" (closes the box, nothing saved), for every department.
2. The reason given ("a saved issue cannot be undone yet") must still be true for the requirement's wording to hold.

---

**Where enforcement lives:**

```tsx
// components/ui/confirm-submit.tsx:L25-L54
if (!confirming) { return <Button type="button" onClick={() => { if (form && !form.reportValidity()) return; setConfirming(true); }}>{startLabel}</Button>; }
return (<div className="... border-red bg-red-bg ..."><p className="text-red">{question}</p>
  <Button type="submit">{pending ? "Saving…" : yesLabel}</Button>
  <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button></div>);
```
```tsx
// app/(dashboard)/packaging/packaging-form.tsx:L93-L99 (Store / R&D) and L125-L131 (Production)
<ConfirmSubmit startLabel={n === 1 ? "Save 1 issue" : `Save ${n} issues`}
  question={`Save ${n === 1 ? "this issue" : `these ${n} issues`}? The stock moves at once, and a saved issue can't be edited or undone.`}
  yesLabel="Yes, save" ... />
```
- Screen only. First click is `type="button"`, runs browser validation, then shows the red box; only "Yes, save" is `type="submit"`. Both department branches use it.
- No server or database counterpart (none is expected for a confirmation step).

---

**Paths walked:**
- Store / R&D: "Save N issues" → red box → "Yes, save" submits to `createPackagingIssue`; "Cancel" returns to the button. ✓
- Production: same component, same text. ✓
- Enter key in a form field: the only submit button exists only while the box is open, so implicit submission cannot skip the box. ✓
- Is the stated reason still true? `void_packaging_issue()` (0127:L58-L176; role check L72-L74: `system_admin`, `inventory_manager`) voids an issue at any time, writing opposite ledger rows and putting stock back; the Void button is on the list (`app/(dashboard)/packaging/packaging-table.tsx:L139-L145`, `void-issue-box.tsx`). So since 0126/0127 a saved issue **can** be undone (by those two roles; a Production issue only while its RM-FP batch is unused, 0127:L88-L100). ✗ for the wording, both in the document ("cannot be undone yet") and in the box itself ("a saved issue can't be edited or undone").
- "can't be edited" is still true: no update policy on `packaging_issues` (0001_init.sql:L567-L569) and no edit screen.
- For an `mfr_manager` (may save, `lib/constants/roles.ts:L46`, may not void, `:L48`) the issue cannot be undone by that user, but it can be by an Inventory Manager or System Admin.

---

**Searched:**
- `Yes, save|cannot be undone|undone|confirm` in `app/(dashboard)/packaging/*.tsx` → packaging-form.tsx L8 (import), L93-L96, L125-L128; void-issue-box.tsx L53 "Yes, void" (different box).
- `can't be edited or undone|cannot be undone` across app, components, lib, docs → packaging-form.tsx, purge-test-data/purge-form.tsx (unrelated), user-guide/guide-html.ts, docs/modules/packaging.md, docs/project/known-issues.md, scan-findings-p8.md, USER_GUIDE.md (L926 purge, unrelated).
- `Yes, save` in USER_GUIDE.md → L699 "Click Save, then Yes, save in the red box"; it does not claim the issue cannot be undone.
- docs/project/known-issues.md:L616 (UX-13): "cannot be undone (until the decided voids P4-09, P6-01, P5-04 are built)" — P6-01 is now built (0126, 0127).
- Label: the button reads "Save 1 issue" / "Save N issues" (packaging-form.tsx:L94, L126); the document's "Save issue(s)" is shorthand for it.

---

**How the verdict was reached:** The behaviour the bullet asks for (a red confirmation box with "Yes, save" / Cancel before every save, all departments) is built exactly, so `implemented`. The justification clause is no longer true: P6-01 voids (REQ-01) let an Inventory Manager or System Admin undo a saved issue at any time. That is a document problem, and the same stale claim appears in the box's own question text, which tells the user something false. No stock or control consequence, so severity low; the fix belongs in the document and the on-screen sentence.

**Open questions:**
- Wording for the box: e.g. "The stock moves at once. A saved issue can't be edited; an Inventory Manager or System Admin can void it." Ravi to confirm (on-screen text, not workflow).
- Update docs/modules/packaging.md:L10 (drop "since a saved issue cannot be undone yet") and the UX-13 row in docs/project/known-issues.md:L616.

## REQ-11 — Packing Register PDF on the list page; several lines per save for Store, R&D and Production

> "The list page has a Packing Register PDF; several lines can be entered in one save (Store, R&D and Production)."
> — docs/modules/packaging.md · bullet 7

**Verdict:** implemented · confidence: high

**What this demands of an implementation:**
1. `/packaging` (list page) offers a PDF titled Packing Register covering the issues on the list.
2. The New issue form lets the user add more than one line and saves them in one action, for each of the three departments (store, rnd, production), and the save is all-or-nothing.

**Where enforcement lives:**

PDF:
```tsx
// app/(dashboard)/packaging/page.tsx:L51-L64, L73
const pdfRows = rows.map((r) => [r.code, fpBatchShort(...), r.pack_size, formatNumber(r.unit_count, 0), r.department,
  materialsSummary(...), rmFpItemCodesText(...), rmFpBatchesText(...), formatDate(r.issue_date),
  r.voided_at ? `VOID ${formatDate(r.voided_at)}: ${r.void_reason ?? ""}` : ""]);
<PackagingExportButton rows={pdfRows} />
```
```tsx
// app/(dashboard)/packaging/packaging-export-button.tsx:L8-L9, L17-L20
const downloadPdfTable = async (...) => (await import("@/lib/pdf")).downloadPdfTable(...);   // loaded on click
title: "Packing Register", ... filename: `packing-register-${todayIst()}.pdf`
```
- Button is in the page header for every signed-in viewer (not gated by `canCreate`). jspdf is imported on click, per the project rule.
- The table also has an Excel export titled "Packing Register" (`packaging-table.tsx:L163-L184`); the PDF is the separate header button.

Multi-line save:
```sql
-- supabase/migrations/0093_packaging_multi_line.sql:L24-L76 (only definition) — Store / R&D
if v_dept is null or v_dept not in ('store', 'rnd') then raise ... 'Several lines can only be saved for Store or R&D.'
if v_n > 30 then raise ... 'at most 30 lines'
for v_line in ... loop perform public.create_packaging_issue(...); ... exception when others then raise 'Line %: %' ...
```
```sql
-- supabase/migrations/0095_production_multi_line.sql:L25 onward (only definition) — Production
-- up to 30 lines in one transaction; one FP batch per line; each line its own PKG code and RM-FP batch
```
- Both RPCs run in one transaction; any line's failure re-raises with "Line N:" and rolls back all lines.
- Each line goes through `create_packaging_issue()` and its triggers, so the per-batch balance (REQ-10) and FIFO material pull apply per line.

Server action: `lib/actions/packaging.ts:L207-L221` routes store/rnd to `createStoreRndIssues` → `create_packaging_issues` (L334-L337) and production to `createProductionIssues` → `create_production_issues` (L413-L416). Both cap lines at 30 in the app too (L97, L134/L247).

Screen: `packaging-form.tsx:L33-L35` (`multiLine = storeOrRnd || production`), `PackagingLinesEditor` (L80-L84) and `ProductionLinesEditor` (L113-L117); "Add line" up to `MAX_PACKAGING_LINES = 30` (`packaging-lines-editor.tsx:L21, L343-L348`; `packaging-production-lines-editor.tsx:L46`). After save the list shows "N packaging issues have been successfully added (PKG-a to PKG-b)" (`page.tsx:L79-L87`).

**Paths walked:**
- List page → Export PDF → `downloadPdfTable` with all loaded rows. ✓
- New issue, department Store/R&D → several lines → `create_packaging_issues` → one transaction. ✓
- New issue, department Production → several lines → `create_production_issues` → one transaction; same batch on two lines refused. ✓
- Department `production` sent to `create_packaging_issues` → refused (0093:L39-L41; test `p_packaging.sql:L104`). Intended routing; not a gap.
- More than 3,000 rows → `downloadPdfTable` refuses and asks the user to narrow the list (`lib/pdf.ts:L65, L125-L131`). The Packaging button always passes every row loaded on the server (`page.tsx:L51`), not the table's search result, so the "narrow the list" advice cannot be followed on this page. Not reachable with today's test data; see Open questions.

**Searched:**
- `Packing Register|packing-register|packingRegister` in app/lib/components → packaging-export-button.tsx:L17, L20; packaging-table.tsx:L164-L165; user-guide/guide-html.ts (guide text); lib/packaging-materials.ts:L29 (comment).
- `function public.create_packaging_issues` → 0093 only. `function public.create_production_issues` → 0095 only.
- `rpc(` in lib/actions/packaging.ts → L172 `fp_batch_block_reason`, L334 `create_packaging_issues`, L413 `create_production_issues`, L439 `void_packaging_issue`.
- `MAX_PACKAGING_LINES|Add line` in the two line editors → limit 30, Add line button in both.
- Tests: `supabase/tests/p_packaging.sql:L86` (two Store lines), `L97` (lines that fit alone but not together refused, naming line 2), `L103` (31 lines refused), `L104` (Production refused on the Store/R&D RPC), `L119` (two Production lines), `L126-L129` (same batch twice refused).

**How the verdict was reached:** both halves of the sentence are present on the paths named: a Packing Register PDF button on the list page, and an all-or-nothing several-line save for each of the three departments, enforced in the database (one transaction, 30-line cap) and mirrored on screen. Nothing the bullet states is missing.

**Document problem:** the header comment of 0093 (L17-L18) still says "Production issues keep the existing single create_packaging_issue() path"; 0095 superseded that. Comment drift only. The PDF's Status column says "VOID dd-mm-yyyy: reason" (page.tsx:L63) while the Excel export says "Void (dd-mm-yyyy): reason" (packaging-table.tsx:L183) and the screen badge says "Void"; cosmetic, relevant to REQ-12's "same on every report" wording.

**Open questions:**
- Over 3,000 issues the Packing Register PDF cannot be produced from this page at all, because the button ignores the table's search/filter. Decide whether the button should take the filtered rows or a date range before go-live volume.

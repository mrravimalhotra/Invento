# React / Next.js performance review, 1 Nov 2026

Done with Vercel's `vercel-react-best-practices` skill (`.claude/skills/`) on the heaviest screens (Dashboard, Reports, Inventory Ledger, Label Printing, MFR report) and the shared shell and table. Bundle sizes measured from a production build. Ravi chose to fix R1 to R6 (Pass 123); R7 and R8 are left as low priority.

| # | Impact | Rule | Finding | Suggested fix |
|---|---|---|---|---|
| R1 (fixed) | High | bundle-dynamic-imports | **Label Printing** loads 2.3 MB of script on open: jsPDF (0.4 MB) and three embedded label fonts (1.4 MB of text) that the on-screen previews use to measure text (`labels/*-sheet-preview.tsx`, `generate-label-pdf.ts`). On a phone on mobile data this is several seconds before the page responds. | Load jsPDF and the fonts after the page has shown; the previews appear a moment later. Needs care: previews must stay pixel-exact to the PDFs. |
| R2 (fixed) | High | async-parallel | **Dashboard** waits on five reads one after another after its first batch: alerts, batches in progress, equipment due (none needs the first batch), then stock balances and usable stock (independent of each other). About 4 extra round trips, roughly 0.3 s per Dashboard open. | Start them together (`Promise.all`). Same numbers, no screen change. |
| R3 (fixed) | Medium | async-parallel | **Every page** (dashboard layout) reads the user and roles, then company details and the idle time-out. One extra round trip per page. | Start company and idle time-out alongside the user read. |
| R4 (fixed) | Medium | bundle-conditional | **MFR report** loads jsPDF + autotable (0.4 MB) on open (`mfr-pdf-button.tsx` imports them at the top). The project rule is that PDF libraries load on click. | Import them inside the click handler, like the intimation PDFs. |
| R5 (fixed) | Medium | bundle-dynamic-imports | **Dashboard** loads the chart library (recharts, 0.4 MB) on open; since UX-03 the charts are the last block on the page. | Load the charts after the page shows (`next/dynamic`). |
| R6 (fixed) | Medium | async-parallel / server-cache | The **low-stock banner** in the top bar runs three reads one after another on every page (items, then balances, then usable stock; the last two are independent) and repeats the Dashboard's own low-stock calculation. It is streamed, so pages do not wait for it, but it is server load on every click. | Run the last two together; optionally keep the result for a minute. |
| R7 | Low | rerender-use-deferred-value | Shared table: typing in the search box filters all rows on every key. Fine today; with the large Reports lists (C17) typing could lag. | `useDeferredValue` on the search text. |
| R8 | Low | js-combine-iterations | Shared table: the opening-stock, inactive and legacy counts re-scan all rows on every redraw (not cached). | Cache them with the filters. |

Already in order: Excel export and the intimation PDFs load on click; `getCurrentUser()` is cached per request (`React.cache`); the low-stock banner is streamed (`Suspense`); table filters and sort are cached and only 15 rows render per page; Reports reads its six sources in parallel; the Ledger reads its two in parallel and is capped at 1,000 rows. Reports sending every row to the browser is C17 (parked by Ravi until go-live).

## Result (Pass 123)

| Page | Script loaded on open, before | After |
|---|---|---|
| Label Printing | about 2.4 MB (jsPDF + label fonts) | 0.14 MB; the preview loads when a batch is shown, the PDF code on Download |
| MFR report | + 0.4 MB (jsPDF) | 0.13 MB; PDF code on Download |
| Dashboard | + 0.4 MB (recharts) | 0.14 MB; charts load after the page |

Dashboard: alerts, batches in progress and equipment now read alongside the first batch, and stock balances with usable stock together. Every page: company details and the idle time-out are read alongside the user. Low-stock banner: balances and usable stock together. Label layout values moved unchanged into `labels/label-constants.ts` (17 values compared equal to the old ones); the MFR PDF code moved unchanged into `mfr/[id]/report/mfr-pdf.ts`.

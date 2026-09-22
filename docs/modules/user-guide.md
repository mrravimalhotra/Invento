# Module 22 — User Guide

Cross-reference: `docs/user-guide/USER_GUIDE.md` (source of truth), `docs/DESIGN.md`
§6 (route map), `lib/constants/nav.ts` (Overview group).

## What this is

Ravi, 22 Sept 2026: *"Create an end-to-end use guide and crate a link in app
for user to download user guide. The user guide needs to be periodically
updated to reflect latest changes. User guide should be able to guide users
on how to use app, functionality, flow of data etc. Create user guide basis
on best practices followed in industry."*

Three parts:

1. **The guide itself** — `docs/user-guide/USER_GUIDE.md`, a single Markdown
   document covering: welcome/intro, Getting Started (sign-in, profile,
   first-time orientation), an end-to-end "how data flows through Invento"
   narrative (Purchase → QC → Inventory → MFR → Finished Product → Packaging
   → COA/Labels), a role guide (what each of the six roles typically does),
   then one section per module — in `nav.ts`'s own group order — each
   following the same template every module doc in this repo already uses
   (Where to find it / Who can use it / What it's for / How-to steps /
   Fields / How it connects / Good to know), and finally a glossary (item
   code prefixes, AR/COA/PO numbering, etc.), an FAQ/troubleshooting
   section, and a "how this guide stays current" note. This is the **source
   of truth** for future edits — never hand-edit the PDF.
2. **A generated PDF** — `public/user-guide.pdf`, rendered from the Markdown
   above and served as a static Next.js asset. Regeneration steps below.
3. **An in-app download page** — `/user-guide` (Overview → User Guide,
   `module: 22` in `nav.ts`), open to every signed-in user with a Download
   and an Open-in-new-tab button, no role gating (informational only, same
   pattern as Reports/Audit Log's nav visibility — no `MODULE_WRITE_ROLES`
   entry needed since there's no write action on this screen).

## Content sourcing

The module-by-module sections were drafted by independently researching
each screen's actual current behavior against both `docs/DESIGN.md` and the
live code (`app/(dashboard)/**`, `lib/actions/**`, `lib/constants/roles.ts`),
not just copied from DESIGN.md's historical spec — several modules (e.g.
Finished Product, COA) have moved on from what DESIGN.md's schema sections
describe. Where the two disagreed, the guide follows the current code.

## Regenerating the PDF

The PDF is built with Python + Playwright (headless Chromium), not a
client-side library — this is a one-off/periodic build step, not something
end users trigger, so it doesn't need to run in the browser bundle the way
COA/label PDFs (jsPDF) do. Rebuild it whenever `USER_GUIDE.md` changes:

1. Convert Markdown → HTML with Pandoc. The `lists_without_preceding_blankline`
   extension is required — without it, Pandoc's default markdown reader
   treats a bullet list that immediately follows a bold-label paragraph
   (no blank line between them, which is how every "Fields you'll be asked
   for" / "Good to know" block in this guide is written) as plain text
   instead of a `<ul>`, silently flattening every bullet list in the
   document into a run-on paragraph with literal dashes:
   ```
   pandoc -f markdown+lists_without_preceding_blankline -t html5 \
     --section-divs -o body.html docs/user-guide/USER_GUIDE.md
   ```
2. Wrap `body.html` into a full page: split out the title/subtitle/version
   line and the "Table of contents" section into a cover page + a separate
   TOC page, embed the Atharva logo (`public/atharva-logo.svg`) as a base64
   `data:` URI, and apply print CSS (brand colors from `app/globals.css`:
   `--brand #1f6f4e` / `--brand-dark #16523a`; forced `page-break-before` on
   each top-level module group's `<section id="…">` so a chapter never
   starts mid-page — see the section id list note below).
3. Render to PDF with Playwright's `page.pdf()` (`display_header_footer`,
   A4, running header "Invento User Guide / Atharva" and footer with page
   numbers) — **not** `wkhtmltopdf`: this sandbox only has the "unpatched
   Qt" build, which silently ignores `--header-html`/`--footer-html`/
   `--print-media-type` entirely (prints a warning, produces a PDF with no
   header/footer and screen, not print, CSS applied). Playwright's bundled
   Chromium (already installed at `/opt/pw-browsers`, no network fetch
   needed — see the sandbox env notes) has full print-CSS and
   header/footer-template support and is the reliable option here.
4. Copy the result to `public/user-guide.pdf` — that exact path/filename is
   what `/user-guide`'s Download and Open-in-new-tab buttons link to
   (`app/(dashboard)/user-guide/page.tsx`); no code change is needed on a
   content-only regeneration, only the file itself.

Note on section ids for step 2's CSS: Pandoc slugifies heading text by
lowercasing, stripping punctuation (including `&` and `:`), and collapsing
whitespace to single hyphens — e.g. "Quality Control & Documents" →
`quality-control-documents` (one hyphen, not two) and "FAQ & troubleshooting"
→ `faq-troubleshooting`. Double-check generated ids (`grep -oE
'<section id="[a-zA-Z0-9-]+"' body.html`) before writing page-break
selectors against them; a mismatched id silently drops the page break
instead of erroring.

## Files

- `docs/user-guide/USER_GUIDE.md` — the guide's Markdown source; edit this,
  never the PDF.
- `public/user-guide.pdf` — the generated, print-ready PDF served statically
  by Next.js.
- `app/(dashboard)/user-guide/page.tsx` — the in-app download page.
- `lib/constants/nav.ts` — `Overview` group, `User Guide` entry (`module: 22`).

## Deviation from the briefing

This module has no database table, no RLS policy, and no `MODULE_WRITE_ROLES`
entry — it's a static-content feature (a Markdown doc, a generated PDF, and
a read-only page), unlike every other module in this list. Flagging this as
a deliberate scope difference, not an oversight: there was nothing to model
as a database write here, and the briefing's "app checks are UI-affordance
only, RLS is the real backstop" convention doesn't apply to a screen with no
writes to back-stop.

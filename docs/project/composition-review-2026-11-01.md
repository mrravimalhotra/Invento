# Component structure review, 1 Nov 2026

Done with Vercel's `vercel-composition-patterns` skill (`.claude/skills/`) on the shared components (`components/ui`, `components/shell`) and the largest forms. Ravi chose to do C1 and C2 (Pass 124); C3 and C4 are left as they are.

**Overall: healthy.** No component is steered by a pile of on/off switches; New and Edit forms are already separate components (the skill's "explicit variants" pattern); dropdowns take their options as children; there is no shared state passed through many layers (no React context is needed anywhere).

| # | Impact | Rule | Finding | Suggestion |
|---|---|---|---|---|
| C1 (done) | Low | patterns-explicit-variants | `packaging/packaging-materials-editor.tsx` has a `compact` switch that picks between two whole layouts. Its only user (`packaging-lines-editor.tsx`) always turns it on, so the second layout (the full table, about 90 lines) is never shown. | Remove the unused layout and the switch. Nothing on screen changes. |
| C2 (done) | Low | react19-no-forwardref | The three label previews still use `forwardRef`, which React 19 no longer needs; nothing passes them a ref any more. | Drop `forwardRef`. Nothing on screen changes. |
| C3 | Info | patterns-children-over-render-props | The packaging line editors take a `footerAction(lineCount, blocked)` function to draw the Save button. A function is the right tool here, because the button needs the editor's own line count and "blocked" state. | Leave. |
| C4 | Info | architecture-compound-components | `DataTable` (used on 29 screens) has grown to 10 options and 400 lines: search, sort, pages, export, three filters, list memory, empty text. Splitting it into parts would touch every list for no visible gain. | Leave; revisit only if more options are needed. |

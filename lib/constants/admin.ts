// Plain constant, deliberately kept OUT of lib/actions/admin.ts: a "use
// server" file may only export async functions in this Next.js version —
// exporting a plain const alongside them silently breaks the module (build
// error: "The module has no exports at all"). See AGENTS.md — this Next.js
// version differs from the trained-on one, confirmed against
// node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md.
export const PURGE_CONFIRM_PHRASE = "PURGE ALL DATA";

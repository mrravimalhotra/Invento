import { Loader2 } from "lucide-react";

// Ravi (21 Sept 2026): "the app is very slow ... where a click has been
// registered but taking time to load there should be some mechanism to let
// user know that click has been registered and next page is loading.
// Implement this as per standard industry practice."
//
// The industry-standard mechanism for this in Next.js's App Router is the
// `loading.tsx` file convention (see app/(dashboard)/loading.tsx and
// app/(auth)/loading.tsx, which both render this component): Next.js
// automatically wraps every page below it in a <Suspense> boundary, and
// shows this fallback the INSTANT a click/navigation is registered — before
// the destination page's data has finished loading on the server — then
// swaps it out for the real content once ready. This is the same mechanism
// GitHub/Linear/Vercel-style apps use for "the click registered, the next
// screen is on its way" feedback, and it requires no client-side JS/library
// of our own — it's server-driven streaming, built into the framework.
//
// Deliberately one shared, generic spinner rather than a bespoke skeleton
// per page: with ~50 routes, a single consistent "next-page-is-loading"
// signal delivers the requested feedback everywhere in one pass. Per-page
// skeletons that mirror each destination's actual layout (table rows, form
// fields, etc.) are a possible follow-up polish pass, not required for the
// ask itself — flagged to Ravi rather than done speculatively.
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      // Fades in after a short delay rather than instantly, so a genuinely
      // fast navigation (already-cached data, warm connection) never
      // flashes a spinner the user barely has time to register — same
      // "don't show it if the wait is imperceptible" principle Next's own
      // docs recommend for useLinkStatus link hints.
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted opacity-0 animate-[page-loading-fade-in_150ms_ease-out_150ms_forwards]"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

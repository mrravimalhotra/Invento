import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/constants/roles";

// Wrapped in React.cache() (21 Sept 2026 — Ravi: "page load is still taking
// a lot of time, even for pages where no data/less data exists such as
// deadstock register or finished product screen"). Root cause:
// getCurrentUser() is called from app/(dashboard)/layout.tsx (every page,
// for the auth redirect + Sidebar/Topbar user) AND, separately, from almost
// every individual page.tsx (for its own canWrite() role check) — 67 call
// sites across the app. Without memoization, EVERY one of those calls ran
// its own fresh supabase.auth.getUser() (a real network round trip to
// Supabase Auth to re-validate the JWT, not a local decode) plus two more
// queries, sequentially — so a single page load was paying for that full
// auth round trip at least twice (layout, then page) before the page's own
// actual data query even started. That fixed, per-page tax was invisible
// on data-heavy pages (dwarfed by the real query cost, e.g. Reports) but
// dominant on data-light ones like Dead Stock or Finished Product, exactly
// matching what Ravi reported. React.cache() scopes its memoization to a
// single request/render pass (per Next.js's own "Reusing data with
// React.cache" guidance) — every call to getCurrentUser() within the same
// page load now shares one real lookup instead of repeating it. Safe: the
// signed-in user can't change mid-request, so returning the same resolved
// value to every caller in that render is exactly correct, not stale.
//
// 21 Sept 2026, second pass: the cache() fix above only removed the
// redundant calls WITHIN the render phase — proxy.ts (middleware) still ran
// its own separate supabase.auth.getUser() before rendering even started
// (it has to, to decide whether to redirect to /login), and React.cache()
// can't reach across that boundary since middleware runs as a completely
// separate phase before the React tree exists. So every request was still
// paying for two full sequential Supabase Auth round trips — one in
// middleware, one here. lib/supabase/middleware.ts now forwards the
// already-validated identity via an x-invento-user-id / x-invento-user-email
// request header (see its own comment for why this can't be spoofed by a
// client) — when present, use it directly and skip this file's own
// supabase.auth.getUser() call entirely, since middleware already did that
// exact check for this exact request a moment earlier. Falls back to a real
// getUser() call when the header is absent (e.g. this ever runs for a
// request that didn't pass through proxy.ts's matcher) so nothing silently
// misbehaves in that case.
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();

  const headersList = await headers();
  const forwardedId = headersList.get("x-invento-user-id");

  let userId: string;
  let userEmail: string;

  if (forwardedId) {
    userId = forwardedId;
    userEmail = decodeURIComponent(headersList.get("x-invento-user-email") ?? "");
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
    userEmail = user.email ?? "";
  }

  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);

  return {
    id: userId,
    email: userEmail,
    fullName: profile?.full_name ?? userEmail,
    roles: (roleRows ?? []).map((r) => r.role as Role),
  };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function hasAnyRole(user: { roles: Role[] } | null, roles: readonly Role[]) {
  if (!user) return false;
  return user.roles.some((r) => roles.includes(r));
}

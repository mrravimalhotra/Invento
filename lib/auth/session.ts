import { cache } from "react";
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
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  return {
    id: user.id,
    email: user.email!,
    fullName: profile?.full_name ?? user.email!,
    roles: (roleRows ?? []).map((r) => r.role as Role),
  };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function hasAnyRole(user: { roles: Role[] } | null, roles: readonly Role[]) {
  if (!user) return false;
  return user.roles.some((r) => roles.includes(r));
}

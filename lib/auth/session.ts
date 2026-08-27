import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/constants/roles";

export async function getCurrentUser() {
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
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export function hasAnyRole(user: { roles: Role[] } | null, roles: readonly Role[]) {
  if (!user) return false;
  return user.roles.some((r) => roles.includes(r));
}

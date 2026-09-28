"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite, ROLES, type Role } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { friendlyDbError } from "@/lib/db-errors";

export type ActionState = { error?: string; success?: string } | undefined;

// Defense in depth: RLS on user_roles (0001_init.sql, policy `user_roles_write`)
// is the real backstop — it rejects any write from a caller who is not already
// system_admin, even a direct API call that bypasses this screen entirely. This
// check exists so the UI can fail with a clear message instead of surfacing a
// raw Postgres RLS error string to the user.
export async function setUserRoles(
  userId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const currentUser = await getCurrentUser();
  if (!canWrite(currentUser?.roles ?? [], "user_roles")) {
    return { error: "Not authorized. Only System Admin can change user roles." };
  }

  if (!userId) return { error: "Missing user." };

  const validRoles = new Set<string>(ROLES);
  const selected = formData
    .getAll("roles")
    .map(String)
    .filter((r): r is Role => validRoles.has(r));

  const supabase = await createClient();

  // SEC-07 (28 Sept 2026, 0073_set_user_roles.sql): one database call that
  // saves the whole role set in a single transaction — previously a
  // delete-all followed by a separate insert, where a failure in between
  // left the user with no roles. The database also refuses any change that
  // would leave no System Admin, and returns that as a readable message.
  const { error } = await supabase.rpc("set_user_roles", { p_user_id: userId, p_roles: selected });
  if (error) return { error: friendlyDbError(error) };

  // Topbar stale-role-badge fix (13 Sept 2026, reported directly by Ravi
  // with screenshots, not a filed /feedback ticket): revalidatePath(
  // "/user-roles") alone only invalidates the /user-roles page segment.
  // Per Next.js's own caching model, shared layouts are NOT automatically
  // refetched on ordinary in-app navigation — only the page segment that
  // changes is. The Topbar (role badge, name)
  // renders from app/(dashboard)/layout.tsx, which every dashboard route
  // shares, so a role change was correctly enforced everywhere (each page
  // does its own fresh getCurrentUser() call) but the Topbar kept showing
  // whatever it last rendered until a hard refresh — a real user reported
  // seeing "System Admin" in the Topbar while /user-roles itself said
  // "Access restricted" for the same account, because their role had been
  // changed since the layout was last rendered in that browser session.
  // revalidatePath("/", "layout") explicitly invalidates the root layout
  // and every nested layout beneath it (including the dashboard layout and
  // therefore the Topbar), on top of the specific page.
  revalidatePath("/user-roles");
  revalidatePath("/", "layout");
  return { success: "Roles updated." };
}

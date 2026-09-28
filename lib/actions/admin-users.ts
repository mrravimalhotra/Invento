"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import { ROLES, type Role } from "@/lib/constants/roles";
import {
  DISABLED_BAN_DURATION,
  MUST_CHANGE_PASSWORD_FLAG,
  PASSWORD_MIN_LENGTH,
  mustChangePassword,
} from "@/lib/constants/auth";
import { friendlyDbError } from "@/lib/db-errors";

export type AdminUserActionState = { error?: string; success?: string } | undefined;

// Admin-managed accounts (28 Sept 2026, Ravi: "admin should be able to set
// user and default password which should be changed at first login"). Public
// self-registration is closed; a System Admin creates each account here with
// a temporary password and at least one role, and proxy.ts forces the user to
// /change-password until they choose their own.
//
// Authorization: every action re-checks system_admin server-side (the
// /user-roles page hiding these forms is UX only). Role rows are written with
// the admin's OWN session (createClient), so user_roles' RLS policy still
// gates them; the service-role client is used only for Supabase Auth admin
// calls that have no RLS-scoped equivalent.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_CONFIGURED =
  "User management isn't configured on the server yet (SUPABASE_SERVICE_ROLE_KEY is missing). See docs/SUPABASE_SETUP.md.";

// Supabase Auth's admin API doesn't know which System Admin asked, so the
// database's own account-change log (0072) can't name them. Record the
// action under the signed-in person's own session as well. Best-effort: the
// account change itself has already happened and is logged by the database
// either way, so a failure here must not turn a success into an error.
async function recordAccountAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  event:
    | "account_created_by_admin"
    | "password_reset_by_admin"
    | "password_changed_by_user"
    | "account_disabled_by_admin"
    | "account_enabled_by_admin"
) {
  await supabase
    .rpc("audit_account_action", { p_user_id: userId, p_event: event })
    .then(() => undefined, () => undefined);
}

async function requireSystemAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes("system_admin")) return null;
  return user;
}

function validateTemporaryPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Temporary password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 72) return "Temporary password must be 72 characters or fewer.";
  return null;
}

export async function createUserAccount(
  _prev: AdminUserActionState,
  formData: FormData
): Promise<AdminUserActionState> {
  const admin = await requireSystemAdmin();
  if (!admin) return { error: "Not authorized. Only System Admin can add users." };
  if (!isAdminClientConfigured()) return { error: NOT_CONFIGURED };

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") || "").trim();
  const tempPassword = String(formData.get("tempPassword") || "");
  const validRoles = new Set<string>(ROLES);
  const roles = [
    ...new Set(
      formData
        .getAll("roles")
        .map(String)
        .filter((r): r is Role => validRoles.has(r))
    ),
  ];

  if (!EMAIL_RE.test(email) || email.length > 254) return { error: "Enter a valid email address." };
  if (!fullName) return { error: "Full name is required." };
  if (fullName.length > 200) return { error: "Full name must be 200 characters or fewer." };
  const passwordError = validateTemporaryPassword(tempPassword);
  if (passwordError) return { error: passwordError };
  // A role-less account can sign in but do nothing useful, and would still be
  // able to read shared data — require at least one role up front.
  if (roles.length === 0) return { error: "Select at least one role for the new user." };

  const adminClient = createAdminClient();
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true, // admin-created: no confirmation email needed
    user_metadata: { full_name: fullName }, // handle_new_user() copies this into profiles
    app_metadata: { [MUST_CHANGE_PASSWORD_FLAG]: true },
  });

  if (createError || !created?.user) {
    const msg = createError?.message ?? "";
    if (createError?.code === "email_exists" || /already (been )?registered|already exists/i.test(msg)) {
      return { error: `An account with ${email} already exists.` };
    }
    if (createError?.code === "weak_password") {
      return { error: "That temporary password is too weak for the Supabase password policy. Try a longer one." };
    }
    return { error: `Couldn't create the account: ${msg || "unknown error"}` };
  }

  const newUserId = created.user.id;
  const supabase = await createClient();
  const { error: rolesError } = await supabase
    .from("user_roles")
    .insert(roles.map((role) => ({ user_id: newUserId, role })));

  if (rolesError) {
    // Don't leave a role-less account behind — undo the creation.
    await adminClient.auth.admin.deleteUser(newUserId).catch(() => undefined);
    return { error: "Couldn't assign roles, so the account was not created. Please try again." };
  }

  await recordAccountAction(supabase, newUserId, "account_created_by_admin");

  revalidatePath("/user-roles");
  return {
    success: `Account created for ${fullName}. Share the temporary password with them privately — they'll be asked to set their own at first sign-in.`,
  };
}

export async function resetUserPassword(
  userId: string,
  _prev: AdminUserActionState,
  formData: FormData
): Promise<AdminUserActionState> {
  const admin = await requireSystemAdmin();
  if (!admin) return { error: "Not authorized. Only System Admin can reset passwords." };
  if (!isAdminClientConfigured()) return { error: NOT_CONFIGURED };
  if (!userId) return { error: "Missing user." };
  if (userId === admin.id) {
    return { error: "Use My Profile to change your own password." };
  }

  const tempPassword = String(formData.get("tempPassword") || "");
  const passwordError = validateTemporaryPassword(tempPassword);
  if (passwordError) return { error: passwordError };

  const adminClient = createAdminClient();
  // app_metadata updates are merged key-by-key by Supabase Auth, so this only
  // sets the flag and leaves provider info untouched. Any session the user
  // already has open is also sent to /change-password on its next request,
  // because proxy.ts reads the flag fresh from Supabase Auth every time.
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: tempPassword,
    app_metadata: { [MUST_CHANGE_PASSWORD_FLAG]: true },
  });
  if (error) {
    if (error.code === "weak_password") {
      return { error: "That temporary password is too weak for the Supabase password policy. Try a longer one." };
    }
    return { error: `Couldn't reset the password: ${error.message}` };
  }

  await recordAccountAction(await createClient(), userId, "password_reset_by_admin");

  revalidatePath("/user-roles");
  return { success: "Temporary password set. They'll be asked to change it at next sign-in." };
}

export async function completePasswordChange(
  _prev: AdminUserActionState,
  formData: FormData
): Promise<AdminUserActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!mustChangePassword(user.app_metadata)) redirect("/");

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > 72) return { error: "Password must be 72 characters or fewer." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };
  if (!isAdminClientConfigured()) return { error: NOT_CONFIGURED };

  // Order matters: change the password first, then clear the flag. If the
  // flag-clear fails the user is still held on this page (safe), rather than
  // being let into the app while still on the admin-issued password.
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    if (updateError.code === "same_password") {
      return { error: "Choose a password different from the temporary one." };
    }
    if (updateError.code === "weak_password") {
      return { error: "That password is too weak. Try a longer one." };
    }
    return { error: `Couldn't change your password: ${updateError.message}` };
  }

  const adminClient = createAdminClient();
  const { error: flagError } = await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: { [MUST_CHANGE_PASSWORD_FLAG]: false },
  });
  if (flagError) {
    return {
      error:
        "Your password was changed, but your account couldn't be unlocked. Try once more with a different new password, or ask your System Admin to reset it.",
    };
  }

  // Refresh so the session's JWT carries the updated app_metadata too.
  await supabase.auth.refreshSession();
  await recordAccountAction(supabase, user.id, "password_changed_by_user");
  revalidatePath("/", "layout");
  redirect("/");
}

// Disable a leaver's account (28 Sept 2026, Ravi: "add functionality to
// disable user if user leaves"). Accounts that appear in the audit log can't
// be deleted — the history must stay attributable — so a leaver is disabled:
//   1. All roles removed via set_user_roles() (0073): one transaction, and
//      refused if this is the last System Admin — nothing else happens then.
//   2. Supabase Auth ban: no new sign-in, no session refresh.
//   3. Any session they still have open is signed out on its next request
//      (lib/supabase/middleware.ts).
// Their previous roles stay visible in the Audit Log. Safe to repeat: if step
// 2 fails after step 1, clicking Disable again finishes the job.
export async function disableUserAccount(
  userId: string,
  _prev: AdminUserActionState,
  _formData: FormData
): Promise<AdminUserActionState> {
  const admin = await requireSystemAdmin();
  if (!admin) return { error: "Not authorized. Only System Admin can disable accounts." };
  if (!isAdminClientConfigured()) return { error: NOT_CONFIGURED };
  if (!userId) return { error: "Missing user." };
  if (userId === admin.id) return { error: "You can't disable your own account." };

  const supabase = await createClient();
  const { error: rolesError } = await supabase.rpc("set_user_roles", { p_user_id: userId, p_roles: [] });
  if (rolesError) return { error: friendlyDbError(rolesError) };

  const adminClient = createAdminClient();
  const { error: banError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: DISABLED_BAN_DURATION,
  });
  if (banError) {
    revalidatePath("/user-roles");
    return {
      error: `Their roles were removed, but sign-in couldn't be blocked: ${banError.message}. Click Disable again to finish.`,
    };
  }

  await recordAccountAction(supabase, userId, "account_disabled_by_admin");
  revalidatePath("/user-roles");
  return { success: "Account disabled. They can no longer sign in." };
}

export async function enableUserAccount(
  userId: string,
  _prev: AdminUserActionState,
  _formData: FormData
): Promise<AdminUserActionState> {
  const admin = await requireSystemAdmin();
  if (!admin) return { error: "Not authorized. Only System Admin can re-enable accounts." };
  if (!isAdminClientConfigured()) return { error: NOT_CONFIGURED };
  if (!userId) return { error: "Missing user." };

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (error) return { error: `Couldn't re-enable the account: ${error.message}` };

  await recordAccountAction(await createClient(), userId, "account_enabled_by_admin");
  revalidatePath("/user-roles");
  return { success: "Account re-enabled. Tick their roles below and click Save roles." };
}

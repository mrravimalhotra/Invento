"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ACCOUNT_DISABLED_MESSAGE, PASSWORD_MIN_LENGTH, safeRedirectPath } from "@/lib/constants/auth";
import { friendlyDbError } from "@/lib/db-errors";

export type ActionState = { error?: string; success?: string } | undefined;

// SEC-09 (28 Sept 2026): sign-in failures get one fixed, plain message per
// kind of problem instead of Supabase's raw text. A wrong email and a wrong
// password give the same answer, so the form can't be used to find out
// which emails have accounts.
function signInErrorMessage(code: string | undefined): string {
  switch (code) {
    case "user_banned":
      return ACCOUNT_DISABLED_MESSAGE;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many sign-in attempts. Wait a few minutes and try again.";
    case "email_not_confirmed":
      return "This account isn't activated yet. Contact your System Administrator.";
    case "invalid_credentials":
      return "Email or password is incorrect.";
    default:
      return "Couldn't sign you in. Check your email and password and try again.";
  }
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  // Only a page on this site — never an outside address (SEC-03).
  const next = safeRedirectPath(formData.get("next"));

  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: signInErrorMessage(error.code) };

  redirect(next);
}

// Self-registration is closed (28 Sept 2026): a System Admin creates accounts
// via createUserAccount (lib/actions/admin-users.ts). Kept as an exported,
// always-refusing action so any stale client that still posts here gets a
// clear answer. Note this does NOT stop a direct call to Supabase Auth's own
// signup endpoint with the public anon key — for that, "Allow new users to
// sign up" must also be switched off in the Supabase dashboard.
export async function signUp(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  return {
    error: "Self-registration is disabled. Ask your System Administrator to create your account.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) return { error: "Email is required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // SCAN-P1-01: the link lands on /auth/confirm, which signs the person in
    // for the password step and then opens /reset-password.
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/confirm`,
  });
  // Same reply whatever went wrong, so this form can't reveal which emails
  // have accounts (SEC-09).
  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
      return { error: "Too many reset requests. Wait a few minutes and try again." };
    }
    console.error("requestPasswordReset:", error.code, error.message);
  }

  return { success: "If that email has an account, a reset link is on its way." };
}

// Self-service password change/profile edit — item 1 on both the Quality
// Control and Store sections of the handwritten requirements list; the
// baseline had no equivalent at all. See docs/DESIGN.md §3.
export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > 72) return { error: "Password must be 72 characters or fewer." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "Choose a password different from your current one." };
    if (error.code === "weak_password") return { error: "That password is too weak. Try a longer one." };
    if (error.code === "reauthentication_needed" || error.code === "session_not_found") {
      return { error: "Your session has expired. Sign in again (or request a new reset link) and retry." };
    }
    console.error("updatePassword:", error.code, error.message);
    return { error: "Couldn't change your password. Please try again." };
  }

  return { success: "Password updated." };
}

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fullName = String(formData.get("fullName") || "").trim();
  if (!fullName) return { error: "Name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/profile");
  return { success: "Profile updated." };
}

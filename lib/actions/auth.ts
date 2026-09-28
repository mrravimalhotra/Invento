"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string; success?: string } | undefined;

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/");

  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(next || "/");
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
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password`,
  });
  if (error) return { error: error.message };

  return { success: "If that email has an account, a reset link is on its way." };
}

// Self-service password change/profile edit — item 1 on both the Quality
// Control and Store sections of the handwritten requirements list; the
// baseline had no equivalent at all. See docs/DESIGN.md §3.
export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { success: "Profile updated." };
}

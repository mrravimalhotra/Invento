import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase client — BYPASSES EVERY RLS POLICY. Used for exactly
// three things. Items 1 and 2 are reached only after the caller has been verified
// as system_admin in lib/actions/admin-users.ts / the /user-roles page:
//   1. Supabase Auth admin calls (create user, set a temporary password,
//      set/clear app_metadata.must_change_password, list users' sign-in
//      status). These have no non-admin equivalent in Supabase.
//   2. Clearing the must_change_password flag for the signed-in user
//      themselves after they choose a new password (completePasswordChange).
//   3. Recording a failed sign-in in the Audit Log (audit_sign_in_failed, SCAN-P1-16),
//      because nobody is signed in at that moment; the database function accepts
//      only this key.
// Never use it for ordinary table reads/writes — those keep going through
// lib/supabase/server.ts so RLS still applies. The "server-only" import makes
// the build fail if this file is ever pulled into client code, and the key is
// read from SUPABASE_SERVICE_ROLE_KEY (never a NEXT_PUBLIC_ variable).

export function isAdminClientConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set on the server.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

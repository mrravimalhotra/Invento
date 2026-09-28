import "server-only";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { isAccountDisabled, mustChangePassword } from "@/lib/constants/auth";

export type UserAccountStatus = {
  email: string | null;
  mustChangePassword: boolean;
  lastSignInAt: string | null;
  disabled: boolean;
};

// Sign-in details that only Supabase Auth holds (email, temporary-password
// flag, last sign-in). Callers MUST have already verified the viewer is
// system_admin — this reads through the service-role client. Returns null when
// the key isn't configured, so the page can explain instead of crashing.
export async function getUserAccountStatuses(): Promise<Map<string, UserAccountStatus> | null> {
  if (!isAdminClientConfigured()) return null;
  const adminClient = createAdminClient();
  const statuses = new Map<string, UserAccountStatus>();
  const perPage = 1000;

  for (let page = 1; page <= 50; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    for (const u of data.users) {
      statuses.set(u.id, {
        email: u.email ?? null,
        mustChangePassword: mustChangePassword(u.app_metadata),
        lastSignInAt: u.last_sign_in_at ?? null,
        disabled: isAccountDisabled(u.banned_until),
      });
    }
    if (data.users.length < perPage) break;
  }
  return statuses;
}

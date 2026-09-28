// Shared auth rules — imported by client forms (live validation), Server
// Actions (authoritative validation) and proxy.ts (forced password change), so
// all three always agree. Plain module on purpose: a "use server" file may
// only export async functions (see known-issues.md, Twenty-fourth pass).

export const PASSWORD_MIN_LENGTH = 6;

// Admin-created accounts (and admin password resets) carry
// app_metadata.must_change_password = true until the user picks their own
// password. app_metadata is only writable with the service-role key, so the
// user cannot clear this flag themselves.
export const MUST_CHANGE_PASSWORD_FLAG = "must_change_password";
export const CHANGE_PASSWORD_PATH = "/change-password";

export function mustChangePassword(appMetadata: Record<string, unknown> | undefined | null): boolean {
  return appMetadata?.[MUST_CHANGE_PASSWORD_FLAG] === true;
}

// Decides where a signed-in user must be sent, given whether their account
// still has a temporary password. Returns null when no redirect is needed.
// Pure function so it can be tested without a running app.
export function forcedPasswordChangeRedirect(pathname: string, mustChange: boolean): string | null {
  const onChangePage = pathname === CHANGE_PASSWORD_PATH;
  if (mustChange && !onChangePage) return CHANGE_PASSWORD_PATH;
  if (!mustChange && onChangePage) return "/";
  return null;
}

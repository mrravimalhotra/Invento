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

// SEC-03 (28 Sept 2026): where to send a user after sign-in. The login page
// carries the page they were trying to open in ?next=, but that value comes
// from the address bar, so anyone can put an outside website there
// (/login?next=https://fake-site.example) and have Invento forward a freshly
// signed-in user to it — a convincing phishing set-up. Only a page on this
// same site is allowed; anything else falls back to the dashboard.
// Parsed with the URL parser rather than string checks, so the tricks
// browsers accept ("//host", "/\host", tabs/newlines inside the slashes,
// "https:host") are all caught by the one same-site test.
const REDIRECT_CHECK_ORIGIN = "http://invento.invalid";

export function safeRedirectPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  let url: URL;
  try {
    url = new URL(next, REDIRECT_CHECK_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== REDIRECT_CHECK_ORIGIN) return "/";
  const path = `${url.pathname}${url.search}${url.hash}`;
  // Normalising can itself produce "//host" (e.g. "/..//host"), which a
  // browser reads as an outside site — refuse that too.
  if (path.startsWith("//") || path.startsWith("/\\")) return "/";
  return path;
}

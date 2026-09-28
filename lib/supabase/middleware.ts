import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { forcedPasswordChangeRedirect, isAccountDisabled, mustChangePassword } from "@/lib/constants/auth";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

// Carry any session-refresh cookies staged by the Supabase client onto a
// redirect response, so a redirect never silently drops a token refresh.
function withSessionCookies(response: NextResponse, staged: NextResponse): NextResponse {
  staged.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  // Disabled account (28 Sept 2026): Supabase Auth's ban stops new sign-ins
  // and session refreshes, but a session that is already open would keep
  // working until its access token expires (up to an hour). getUser() above
  // reads the account fresh on every request, so end that session here, on
  // the very next click. scope "local" only clears this browser's cookies —
  // no call back to Supabase Auth, which refuses a banned user anyway.
  if (user && isAccountDisabled(user.banned_until)) {
    await supabase.auth.signOut({ scope: "local" });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?disabled=1";
    return withSessionCookies(NextResponse.redirect(url), supabaseResponse);
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Forced password change (28 Sept 2026): an account created or reset by a
  // System Admin carries app_metadata.must_change_password until the user
  // picks their own password. getUser() above reads the user fresh from
  // Supabase Auth on every request (not from the cookie's possibly-stale
  // JWT), so a reset takes effect immediately, even on an already-open
  // session. Applies to every route, including Server Action POSTs, except
  // /change-password itself (whose form and sign-out button post back to it).
  if (user) {
    const target = forcedPasswordChangeRedirect(
      request.nextUrl.pathname,
      mustChangePassword(user.app_metadata)
    );
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      url.search = "";
      return withSessionCookies(NextResponse.redirect(url), supabaseResponse);
    }
  }

  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Forward the already-validated identity to the render phase via a request
  // header (21 Sept 2026 — see lib/auth/session.ts's getCurrentUser for the
  // other half of this). This getUser() call above already did a real
  // network round trip to Supabase Auth to check the JWT; without this,
  // getCurrentUser() would repeat that exact same round trip a second time
  // for every request, since React.cache() can only dedupe calls within one
  // render pass and can't reach across the middleware/render boundary
  // (middleware runs as a separate phase before the React tree exists).
  //
  // Security: only this file can set these two headers for what the render
  // phase sees. NextResponse.next({ request: { headers } }) — as opposed to
  // NextResponse.next({ headers }) — replaces what's visible to downstream
  // Server Components with exactly this Headers object (Next.js's own docs,
  // "Setting Headers" in the Proxy/middleware reference: "make requestHeaders
  // available upstream", not to the client) — a request can never inject or
  // preserve its own value for these, because every branch below always
  // either overwrites them with the value just validated above (the `user`
  // branch) or explicitly deletes them (the no-`user` branch); there is no
  // path that leaves a client-supplied value untouched.
  const requestHeaders = new Headers(request.headers);
  if (user) {
    requestHeaders.set("x-invento-user-id", user.id);
    requestHeaders.set("x-invento-user-email", encodeURIComponent(user.email ?? ""));
  } else {
    requestHeaders.delete("x-invento-user-id");
    requestHeaders.delete("x-invento-user-email");
  }

  // Build the final response from these headers, but carry forward any
  // session-refresh cookies the setAll callback above already staged on
  // supabaseResponse — constructing a fresh NextResponse here would
  // otherwise silently drop them and break session refresh.
  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  supabaseResponse.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));
  return finalResponse;
}

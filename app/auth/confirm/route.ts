import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// SCAN-P1-01: the page behind the "Reset password" e-mail link.
//
// The e-mail link used to open /reset-password carrying a one-time code that
// nothing exchanged for a session, so the new-password step always failed
// ("auth session missing"). This route does the exchange and then sends the
// person on to /reset-password signed in for the one purpose of choosing a
// new password.
//
// Two link shapes are accepted, both for password recovery only:
//   ?token_hash=...&type=recovery  the link used by the customised e-mail
//                                  template (works from any browser or phone)
//   ?code=...                      the link Supabase sends with its default
//                                  template (works in the browser that asked
//                                  for the reset)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  const url = request.nextUrl.clone();
  url.pathname = "/reset-password";
  url.search = ok ? "" : "?expired=1";
  return NextResponse.redirect(url);
}

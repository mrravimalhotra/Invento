import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Component / Server Action client. Runs as the signed-in user —
// every query is subject to the RLS policies in supabase/migrations, which
// is the whole point (see docs/DESIGN.md §3): there is no service-role
// bypass here, so a screen can only do what that user's roles allow.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component that can't set cookies — safe to
            // ignore because middleware.ts refreshes the session on every request.
          }
        },
      },
    }
  );
}

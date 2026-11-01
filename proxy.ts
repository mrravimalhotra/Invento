import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the `middleware` file/export convention to `proxy` — see
// node_modules/next/dist/docs/.../upgrading/version-16.md ("middleware to proxy").
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Security review (1 Nov 2026): only the real public files skip the proxy, listed by name.
// The old rule skipped every address ending in .png, .svg and so on, so a page address
// such as /items/abc.png bypassed the sign-in check and its x-invento-user-* headers
// (lib/auth/session.ts trusts them). A new file in /public that is not listed here simply
// needs sign-in, which fails safe; add it here if it must load before sign-in.
export const config = {
  matcher: [
    "/((?!_next/static/|_next/image|favicon\\.ico$|manifest\\.webmanifest$|apple-touch-icon\\.png$|atharva-logo\\.svg$|icon-192\\.png$|icon-512\\.png$|icon-maskable-512\\.png$|fonts/).*)",
  ],
};

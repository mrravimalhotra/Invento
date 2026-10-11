import type { NextConfig } from "next";

// SEC-10 (28 Sept 2026, security bundle — claude/security-bundle-decision.md):
// standard browser security headers on every response.
//
// Enforced now (nothing in the app depends on the opposite):
// - No framing: another website can't load Invento invisibly inside its own
//   page and trick a signed-in user into clicking Final Submit / Approve /
//   Purge (clickjacking). X-Frame-Options for older browsers,
//   frame-ancestors for current ones. The app itself uses no iframes.
// - nosniff: the browser never guesses a file's type (a download is never
//   run as a script).
// - Referrer-Policy: only the site's address, never full page paths or
//   IDs, is passed on when a link to another site is followed.
// - Permissions-Policy: camera, microphone, location, payment and USB are
//   switched off for the whole site (none are used).
// - base-uri / object-src: blocks two classic injection tricks (rewriting
//   where relative links point; embedding plugins).
//
// Report-only for now: the full script/style/connection policy below. The
// browser only reports (in the console) what it WOULD block and blocks
// nothing, so it can't break any screen. Once a period of normal use shows
// no reports, it can be switched to enforcing by renaming the header key.
//
// HTTPS-only (HSTS) is already sent by Vercel on its domains.

const isDev = process.env.NODE_ENV === "development";

const enforcedCsp = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"].join("; ");

const reportOnlyCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: enforcedCsp },
  { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // SCAN-P2-08: Server Actions accept 1 MB by default. The upload pages cap
  // files at 800 KB in the browser and again on the server with a plain
  // message; this higher limit only lets a file between 800 KB and 4 MB reach
  // the server so it gets that message instead of the framework error page.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;

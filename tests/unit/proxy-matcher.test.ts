import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../../proxy";

// Security review (1 Nov 2026): every page address must pass through the sign-in proxy,
// whatever it ends in; only the named public files may skip it.
const runsProxy = (path: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(path));

test("page addresses always pass through the proxy", () => {
  for (const p of ["/", "/items/abc", "/items/abc.png", "/qc/x.jpg", "/user-roles/a.svg", "/user-guide.pdf", "/api/bulk-upload/template/items"]) {
    assert.ok(runsProxy(p), p);
  }
});

test("only the named public files skip it", () => {
  for (const p of ["/atharva-logo.svg", "/icon-192.png", "/apple-touch-icon.png", "/favicon.ico", "/manifest.webmanifest", "/fonts/NotoSans-Regular.ttf", "/_next/static/chunks/a.js"]) {
    assert.ok(!runsProxy(p), p);
  }
});

import { NAV_GROUPS } from "@/lib/constants/nav";

export const FEEDBACK_CATEGORIES = [
  "bug",
  "enhancement",
  "invalid",
  "user_education",
  "duplicate",
  "other",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  enhancement: "Enhancement",
  invalid: "Invalid request",
  user_education: "User education",
  duplicate: "Duplicate",
  other: "Other",
};

export const FEEDBACK_STATUSES = ["new", "awaiting_implementation", "implemented", "rejected"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Awaiting review",
  awaiting_implementation: "Awaiting implementation",
  implemented: "Implemented",
  rejected: "Rejected",
};

// Flat list of every known page, built from the nav so it stays in
// sync automatically as modules are added. Longest-href-first so a
// prefix match (e.g. "/purchase" vs "/purchase/new") picks the most
// specific entry.
const KNOWN_PAGES = NAV_GROUPS.flatMap((g) => g.items)
  .map((item) => ({ href: item.href, label: item.label }))
  .sort((a, b) => b.href.length - a.href.length);

const EXTRA_PAGES: Record<string, string> = {
  "/profile": "Profile",
  "/login": "Sign in",
  "/register": "Register",
  "/forgot-password": "Forgot password",
  "/reset-password": "Reset password",
};

/**
 * Normalize a full pathname (which may include a dynamic id segment,
 * e.g. "/purchase/3fa2.../report") down to the page it belongs to for
 * feedback grouping — "/purchase" — plus a human label.
 */
export function getPageMeta(pathname: string): { pagePath: string; pageLabel: string } {
  if (pathname === "/") return { pagePath: "/", pageLabel: "Dashboard" };

  for (const page of KNOWN_PAGES) {
    if (page.href !== "/" && (pathname === page.href || pathname.startsWith(page.href + "/"))) {
      return { pagePath: page.href, pageLabel: page.label };
    }
  }

  for (const [href, label] of Object.entries(EXTRA_PAGES)) {
    if (pathname === href || pathname.startsWith(href + "/")) {
      return { pagePath: href, pageLabel: label };
    }
  }

  // Fallback: first path segment as both path and a title-cased label.
  const first = "/" + (pathname.split("/").filter(Boolean)[0] ?? "");
  const label = first
    .slice(1)
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  return { pagePath: first || "/", pageLabel: label || "Page" };
}

"use client";

import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";

/**
 * The app-wide "Hide legacy data" control (1 Sept 2026, Ravi: "add option to
 * hide legacy records in main dashboard. If hidden, legacy records should
 * be hidden through out the app including all pages and drop downs").
 *
 * Reads/writes the same localStorage preference every list-table toggle and
 * every legacy-aware <Select> combobox already reads — this is just the one
 * prominent, always-visible place to flip it, on the Dashboard. Turning it
 * on here immediately hides legacy rows and dropdown options everywhere
 * else in the app (each page/component reads the same shared preference on
 * its own mount); nothing needs to be "pushed" to other pages.
 */
export function HideLegacyToggle() {
  const [hideLegacy, setHideLegacy] = useHideLegacy();

  return (
    <label className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm text-muted">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-border"
        checked={hideLegacy}
        onChange={(e) => setHideLegacy(e.target.checked)}
      />
      Hide legacy data
      <span className="text-xs text-muted">(applies app-wide — lists and dropdowns)</span>
    </label>
  );
}

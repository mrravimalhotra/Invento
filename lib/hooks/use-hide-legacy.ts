"use client";

import { useCallback, useEffect, useState } from "react";

// FB-0003, extended 1 Sept 2026 (audit-fix pass) to be a single shared
// preference read/written from more than one component type at once
// (DataTable's per-page checkbox, the Dashboard's app-wide toggle, and
// every item/vendor/batch/MFR <Select> combobox) instead of each one
// re-implementing its own localStorage read/write.
//
// Same storage key DataTable has always used, so a value set from any one
// of those places is honored everywhere else without a migration step.
export const HIDE_LEGACY_STORAGE_KEY = "invento_hide_legacy_data";

// Components mount/unmount across full page navigations (Next.js re-renders
// the tree on every route change), so a plain read-on-mount is enough to
// pick up a change made on a previous page. The one place that isn't true
// is two of these hooks mounted on the *same* page at the same time (e.g.
// the Dashboard's toggle plus some other legacy-aware control rendered
// alongside it) — for that case we also broadcast a same-tab custom event
// on write, and listen for both that and the cross-tab "storage" event, so
// every mounted instance stays in sync immediately instead of only after
// the next navigation.
const HIDE_LEGACY_EVENT = "invento:hide-legacy-changed";

function readPreference(): boolean {
  try {
    return window.localStorage.getItem(HIDE_LEGACY_STORAGE_KEY) === "1";
  } catch {
    // localStorage unavailable (private browsing, etc.) — default stays off.
    return false;
  }
}

export function useHideLegacy(): [boolean, (next: boolean) => void] {
  const [hideLegacy, setHideLegacyState] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHideLegacyState(readPreference());

    function handleChange() {
      setHideLegacyState(readPreference());
    }
    window.addEventListener(HIDE_LEGACY_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(HIDE_LEGACY_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const setHideLegacy = useCallback((next: boolean) => {
    setHideLegacyState(next);
    try {
      window.localStorage.setItem(HIDE_LEGACY_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Best-effort persistence only.
    }
    window.dispatchEvent(new Event(HIDE_LEGACY_EVENT));
  }, []);

  return [hideLegacy, setHideLegacy];
}

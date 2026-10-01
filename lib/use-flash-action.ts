"use client";

import { useActionState, useCallback } from "react";
import { flash } from "@/lib/flash";

type Result = { error?: string; success?: string | boolean } | undefined | void;

// ---------------------------------------------------------------------------
// FB-0045 (1 Oct 2026): "if any point is missed or entered incorrectly, the
// system requires re-entering all information".
//
// Cause: React 19 resets a <form action={fn}> after the action finishes, whether
// it succeeded or failed. A refusal such as "Item type is required" therefore
// wiped every field the user had typed. 44 forms use this helper, so the fix
// lives here once instead of in each form.
//
// How: React performs the reset by calling form.reset(), which fires a
// cancelable "reset" event. When an action returns an error we remember which
// form was submitted and cancel that one reset. On success nothing changes, so
// forms still clear after a successful save exactly as before. The mark is tied
// to the submitted form, expires after a few seconds, and is cleared by the next
// submit, so it can never swallow a different form's reset or a later success.
// Covered by the check in docs/modules/shell.md ("Forms keep entries on error").
// ---------------------------------------------------------------------------
type KeepState = { lastSubmitted: HTMLFormElement | null; keep: HTMLFormElement | null; until: number };
const KEEP_WINDOW_MS = 5000;

function keepState(): KeepState | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { __inventoFormKeep?: KeepState };
  if (!w.__inventoFormKeep) {
    const s: KeepState = { lastSubmitted: null, keep: null, until: 0 };
    w.__inventoFormKeep = s;
    // Capture phase: runs before React's own handling, once for the whole app.
    document.addEventListener(
      "submit",
      (e) => {
        s.lastSubmitted = e.target instanceof HTMLFormElement ? e.target : null;
        s.keep = null; // a new attempt starts clean
      },
      true
    );
    document.addEventListener(
      "reset",
      (e) => {
        if (s.keep && e.target === s.keep && Date.now() < s.until) {
          e.preventDefault(); // keep what the user typed
          s.keep = null;
        }
      },
      true
    );
  }
  return w.__inventoFormKeep;
}

// Install the two listeners as soon as this module loads in the browser, so they
// exist before the very first submit.
keepState();

// Drop-in replacement for useActionState for server actions that return
// { success } or { error }. Shows the outcome as a notice the moment the
// server replies, independent of what the form does afterwards (reset,
// unmount, re-render), so a result can no longer go unseen. When the action
// returns an error the form keeps everything the user typed (FB-0045).
export function useFlashActionState<State extends Result, Payload>(
  action: (prev: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>
) {
  const wrapped = useCallback(
    async (prev: Awaited<State>, payload: Payload) => {
      const keep = keepState();
      const result = await action(prev, payload);
      if (result && typeof result === "object") {
        if (typeof result.success === "string" && result.success) flash(result.success, "success");
        else if (!result.success && result.error) {
          flash(result.error, "error");
          if (keep && keep.lastSubmitted) {
            keep.keep = keep.lastSubmitted;
            keep.until = Date.now() + KEEP_WINDOW_MS;
          }
        }
      }
      return result as Awaited<State>;
    },
    [action]
  );
  return useActionState(wrapped, initialState);
}

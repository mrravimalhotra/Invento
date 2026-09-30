"use client";

import { useActionState, useCallback } from "react";
import { flash } from "@/lib/flash";

type Result = { error?: string; success?: string | boolean } | undefined | void;

// Drop-in replacement for useActionState for server actions that return
// { success } or { error }. Shows the outcome as a notice the moment the
// server replies, independent of what the form does afterwards (reset,
// unmount, re-render), so a result can no longer go unseen.
export function useFlashActionState<State extends Result, Payload>(
  action: (prev: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>
) {
  const wrapped = useCallback(
    async (prev: Awaited<State>, payload: Payload) => {
      const result = await action(prev, payload);
      if (result && typeof result === "object") {
        if (typeof result.success === "string" && result.success) flash(result.success, "success");
        else if (!result.success && result.error) flash(result.error, "error");
      }
      return result as Awaited<State>;
    },
    [action]
  );
  return useActionState(wrapped, initialState);
}

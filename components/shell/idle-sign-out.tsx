"use client";

import { useEffect, useRef, useState } from "react";
import { signOutIdle } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

// SCAN-P1-02 (Ravi, 12 Oct 2026): signs a person out after a period with no
// activity, so a PC left unlocked on the shop floor or in the QC lab does not
// stay signed in for days. The period is a setting (Admin -> User Roles &
// Access, default 60 minutes, 0 = off); the dashboard layout does not render
// this at all for a System Admin or when the setting is off.
//
// Activity = a key press, click, touch or (outside the warning) a mouse move or
// scroll in any open Invento tab; the last-activity time is shared between tabs
// through localStorage (when the browser allows it). A warning shows two
// minutes before the sign-out, with a button to stay signed in. The check runs
// on the clock every 10 seconds, so a laptop that slept is signed out on wake.
const KEY = "invento:last-activity";
const WARN_MS = 2 * 60 * 1000;
const CHECK_MS = 10 * 1000;

function readShared(): number | null {
  try {
    const v = window.localStorage.getItem(KEY);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeShared(t: number) {
  try {
    window.localStorage.setItem(KEY, String(t));
  } catch {
    // storage blocked: this tab still tracks its own activity
  }
}

export function IdleSignOut({ minutes }: { minutes: number }) {
  const limitMs = minutes * 60 * 1000;
  const last = useRef(0);
  const warningShown = useRef(false);
  const signingOut = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    last.current = Date.now();
    writeShared(last.current);

    function touch(t: number) {
      last.current = t;
      writeShared(t);
    }
    function onStrongActivity() {
      touch(Date.now());
      if (warningShown.current) {
        warningShown.current = false;
        setSecondsLeft(null);
      }
    }
    // Mouse moves and scrolling count as activity only while no warning is showing,
    // so a mouse nudge cannot hide it by accident.
    let lastWeak = 0;
    function onWeakActivity() {
      if (warningShown.current) return;
      const now = Date.now();
      if (now - lastWeak < 5000) return;
      lastWeak = now;
      touch(now);
    }

    const strong = ["keydown", "pointerdown", "touchstart"] as const;
    const weak = ["mousemove", "scroll", "wheel"] as const;
    strong.forEach((e) => window.addEventListener(e, onStrongActivity, { passive: true }));
    weak.forEach((e) => window.addEventListener(e, onWeakActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const shared = readShared();
      const lastActive = Math.max(last.current, shared ?? 0);
      const idle = Date.now() - lastActive;
      if (idle >= limitMs) {
        if (!signingOut.current) {
          signingOut.current = true;
          void signOutIdle();
        }
        return;
      }
      if (idle >= limitMs - WARN_MS) {
        warningShown.current = true;
        setSecondsLeft(Math.max(0, Math.ceil((limitMs - idle) / 1000)));
      } else if (warningShown.current) {
        // activity in another tab
        warningShown.current = false;
        setSecondsLeft(null);
      }
    }, CHECK_MS);

    return () => {
      strong.forEach((e) => window.removeEventListener(e, onStrongActivity));
      weak.forEach((e) => window.removeEventListener(e, onWeakActivity));
      window.clearInterval(timer);
    };
  }, [limitMs]);

  if (secondsLeft === null) return null;
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Automatic sign-out"
      className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-amber/30 bg-amber-bg p-4 text-sm text-amber shadow-lg"
    >
      <p className="font-semibold">Still there?</p>
      <p className="mt-1">
        You will be signed out in about {m > 0 ? `${m} min ` : ""}
        {s} s because there has been no activity.
      </p>
      <div className="mt-3">
        <Button
          size="sm"
          onClick={() => {
            const now = Date.now();
            last.current = now;
            writeShared(now);
            warningShown.current = false;
            setSecondsLeft(null);
          }}
        >
          Stay signed in
        </Button>
      </div>
    </div>
  );
}

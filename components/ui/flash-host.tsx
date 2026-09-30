"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FLASH_EVENT, flash, type FlashDetail, type FlashKind } from "@/lib/flash";
import { savedMessage } from "@/lib/saved-messages";

type Item = { id: number; message: string; kind: FlashKind };

// Mounted once in the dashboard layout. Shows every success / failure notice
// at the top of the screen; success fades after 8 s, errors stay until closed.
export function FlashHost() {
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(1);
  const params = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    function onFlash(e: Event) {
      const { message, kind } = (e as CustomEvent<FlashDetail>).detail;
      const id = nextId.current++;
      setItems((cur) => [...cur.slice(-3), { id, message, kind }]);
      if (kind === "success") window.setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 8000);
    }
    window.addEventListener(FLASH_EVENT, onFlash);
    return () => window.removeEventListener(FLASH_EVENT, onFlash);
  }, []);

  // Redirect-style actions land on `?saved=<key>`: show it once, then tidy the
  // address so a refresh doesn't show it again.
  const saved = params.get("saved");
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    if (!saved) {
      lastSaved.current = null;
      return;
    }
    if (lastSaved.current === saved) return; // dev-mode double effect / re-render
    const message = savedMessage(saved);
    if (!message) return;
    lastSaved.current = saved;
    flash(message, "success");
    const next = new URLSearchParams(window.location.search);
    next.delete("saved");
    const qs = next.toString();
    window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, [saved, pathname]);

  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((i) => (
        <div
          key={i.id}
          role={i.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-lg ${
            i.kind === "error" ? "border-red/40 bg-white text-red" : "border-brand/40 bg-brand-light text-brand-dark"
          }`}
        >
          <span className="flex-1">{i.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setItems((cur) => cur.filter((x) => x.id !== i.id))}
            className="shrink-0 font-semibold leading-none opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

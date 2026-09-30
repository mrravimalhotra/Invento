"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { NavList } from "./nav-list";

/**
 * Phone / narrow-window menu (under 768 px): a ☰ button for the top bar that
 * opens the same menu as the desktop sidebar as a slide-in panel. Hidden from
 * 768 px up, where the fixed sidebar is shown instead.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // While open: Esc closes, the page behind does not scroll, focus moves in.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground/80 hover:bg-black/5"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div
        className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl transition-transform duration-200 ${
            open ? "translate-x-0" : "-translate-x-full invisible"
          }`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pl-5 pr-2">
            <Image
              src="/atharva-logo.svg"
              alt="Atharva Nature Healthcare"
              width={1344}
              height={516}
              className="h-9 w-auto"
            />
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center rounded-md text-foreground/80 hover:bg-black/5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <NavList onNavigate={() => setOpen(false)} />
        </aside>
      </div>
    </div>
  );
}

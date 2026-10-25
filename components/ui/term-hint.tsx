"use client";

import { useRef, useState } from "react";
import { Info } from "lucide-react";
import { termsIn } from "@/lib/glossary";

// UX-07 part 2: a small ⓘ that explains the short terms in a heading on hover, tap or
// keyboard focus. Renders nothing when the text has no glossary term. The bubble is
// placed against the screen (position: fixed), so a table's scroll box cannot cut it off.
const WIDTH = 256;

export function TermHint({ text }: { text: string }) {
  const terms = termsIn(text);
  if (terms.length === 0) return null;
  const meaning = terms.map((t) => `${t.term}: ${t.meaning.replace(/^[^:]+: /, "")}`).join(" ");
  return <InfoHint text={meaning} label={`What ${terms.map((t) => t.term).join(" and ")} means`} />;
}

// UX-08 (25 Oct 2026): the same ⓘ, for any extra explanation (used by Field's `more`).
export function InfoHint({ text, label = "More about this" }: { text: string; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const meaning = text;
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8));
    setPos({ top: r.bottom + 4, left });
  };
  const hide = () => setPos(null);

  return (
    <span className="ml-1 inline-flex align-middle normal-case tracking-normal">
      <button
        ref={ref}
        type="button"
        aria-label={label}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={show}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted hover:text-foreground focus:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 max-md:h-6 max-md:w-6"
      >
        <Info className="h-3 w-3" aria-hidden="true" />
      </button>
      {pos && (
        <span
          role="tooltip"
          style={{ position: "fixed", top: pos.top, left: pos.left, width: WIDTH }}
          className="pointer-events-none z-50 whitespace-normal rounded-md bg-foreground px-2.5 py-1.5 text-left text-xs font-normal text-white shadow-lg"
        >
          {meaning}
        </span>
      )}
    </span>
  );
}

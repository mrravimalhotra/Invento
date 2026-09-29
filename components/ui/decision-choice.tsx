"use client";

import { cn } from "@/lib/utils";

// UX-01 (29 Sept 2026): the QC Approved / Rejected choice was two plain
// buttons that only set state, so it was not a form control at all (no radio
// semantics, nothing for a keyboard or screen reader to announce, and the
// hidden input had to be kept in step by hand). These are real radio inputs
// styled as the same two buttons, so the chosen value is submitted by the
// browser itself and the arrow keys move between the two.
export type DecisionOption<V extends string> = { value: V; label: string; tone: "approve" | "reject" };

export function DecisionChoice<V extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: V | "";
  onChange: (v: V) => void;
  options: DecisionOption<V>[];
}) {
  return (
    <div role="radiogroup" aria-label="Decision" className="flex gap-2">
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex-1 cursor-pointer rounded-md border px-4 py-2 text-center text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-brand/40",
              selected
                ? o.tone === "reject"
                  ? "border-red bg-red-bg text-red"
                  : "border-brand bg-brand-light text-brand-dark"
                : "border-border bg-white hover:bg-black/5"
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={selected}
              onChange={() => onChange(o.value)}
              required
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

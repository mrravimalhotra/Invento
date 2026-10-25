"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// UX-13 (25 Oct 2026): a step that can't be undone asks once more, in the same red box
// as a QC rejection. The first click checks the form's own rules (required boxes) and
// only then shows the question; "Yes" submits the form.
export function ConfirmSubmit({
  startLabel,
  question,
  yesLabel,
  pending,
  disabled,
}: {
  startLabel: string;
  question: string;
  yesLabel: string;
  pending: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div ref={ref}>
        <Button
          type="button"
          disabled={disabled || pending}
          onClick={() => {
            const form = ref.current?.closest("form");
            if (form && !form.reportValidity()) return;
            setConfirming(true);
          }}
        >
          {startLabel}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border border-red bg-red-bg px-3 py-3 text-sm">
      <p className="text-red">{question}</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || disabled}>
          {pending ? "Saving…" : yesLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

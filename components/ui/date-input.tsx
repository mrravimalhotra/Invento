"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { dateEntryError, dmyToIso, isoToDmy } from "@/lib/date-entry";

// UX-10 (25 Oct 2026): a date box that always reads dd-mm-yyyy. The browser's own date
// box follows the computer's language (mm/dd/yyyy on an English-US computer), so the
// visible box is plain text and a hidden date input carries the yyyy-mm-dd value the
// form sends (same `name`, so actions are unchanged). The calendar button opens the
// browser's picker on that hidden input. value / defaultValue / min / max stay yyyy-mm-dd.
type DateEvent = { target: HTMLInputElement; currentTarget: HTMLInputElement };

export function DateInput({
  id,
  name,
  value,
  defaultValue,
  onChange,
  min,
  max,
  required,
  disabled,
  className,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: DateEvent) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const textRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => isoToDmy(value ?? defaultValue));
  const [lastValue, setLastValue] = useState(value);

  // A controlled value changed from outside: show it, unless the typed text already means it.
  if (value !== undefined && value !== lastValue) {
    setLastValue(value);
    if (dmyToIso(text) !== value) setText(isoToDmy(value));
  }

  // The visible box carries the message; the browser shows it on submit.
  useEffect(() => {
    textRef.current?.setCustomValidity(dateEntryError(text, { required, min, max }));
  }, [text, required, min, max]);

  // A form reset (after a successful save) puts the hidden input back to its default: follow it.
  useEffect(() => {
    const form = nativeRef.current?.form;
    if (!form) return;
    const onReset = (e: Event) =>
      setTimeout(() => {
        if (!e.defaultPrevented && nativeRef.current) setText(isoToDmy(nativeRef.current.value));
      }, 0);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  function commit(iso: string) {
    const native = nativeRef.current;
    if (!native || native.value === iso) return;
    native.value = iso;
    onChange?.({ target: native, currentTarget: native });
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={textRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="dd-mm-yyyy"
        value={text}
        disabled={disabled}
        aria-required={required || undefined}
        className="pr-9"
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const iso = dmyToIso(t);
          if (iso) commit(iso);
          else if (t.trim() === "") commit("");
        }}
        onBlur={() => {
          const iso = dmyToIso(text);
          if (iso) setText(isoToDmy(iso));
        }}
      />
      <input
        ref={nativeRef}
        type="date"
        name={name}
        defaultValue={value ?? defaultValue}
        min={min}
        max={max}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 h-px w-full opacity-0"
        onChange={(e) => {
          setText(isoToDmy(e.target.value));
          onChange?.({ target: e.target, currentTarget: e.currentTarget });
        }}
      />
      <button
        type="button"
        aria-label="Open calendar"
        disabled={disabled}
        onClick={() => {
          const native = nativeRef.current;
          if (!native) return;
          try {
            native.showPicker();
          } catch {
            textRef.current?.focus();
          }
        }}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted hover:text-foreground disabled:opacity-40 max-md:w-11"
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

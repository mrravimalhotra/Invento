"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";

type OptionInfo = {
  value: string;
  label: string;
  disabled: boolean;
  // FB-0007/0008/0009/0011 (1 Sept 2026): a caller marks an <option> as
  // legacy-imported data with `data-legacy="1"` (see isLegacyCode() call
  // sites in the item/vendor/batch/MFR pickers) rather than this component
  // trying to infer it — Select has no idea what an arbitrary option's
  // value/label mean for the many non-legacy-aware dropdowns in the app
  // (status, category, unit, role, ...).
  legacy: boolean;
};

// FB-0016 (2 Sept 2026): an <option> with more than one JSX child/expression
// — e.g. `<option>{item.item_code} — {item.name}</option>` — hands React's
// `children` prop an ARRAY (["RM-00002", " — ", "Ashwagandha"]), not a
// string. The old `typeof props.children === "string" ? ... : String(...)`
// fallback then ran `String(anArray)`, which is `Array.prototype.join(",")`
// under the hood — silently inserting a stray comma next to the intended
// " — " separator in every affected dropdown (item/vendor/batch pickers
// throughout the app, not just Purchase's). Walk the children tree instead
// and concatenate every string/number leaf directly, so whatever separator
// text already sits between the JSX expressions in the source is preserved
// exactly and nothing extra is inserted.
function childrenToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(childrenToText).join("");
  if (isValidElement(node)) return childrenToText((node.props as { children?: ReactNode }).children);
  return "";
}

function optionsFromChildren(children: ReactNode): OptionInfo[] {
  const options: OptionInfo[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<Record<string, unknown>>;
    if (el.type !== "option") return;
    const props = el.props;
    const rawValue = props.value;
    const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
    const label = childrenToText(props.children as ReactNode) || value;
    options.push({
      value,
      label,
      disabled: Boolean(props.disabled),
      legacy: props["data-legacy"] === "1" || props["data-legacy"] === true,
    });
  });
  return options;
}

/**
 * Every dropdown in the app should be searchable/type-to-filter (per Ravi,
 * 1 Sept 2026 — "all drop downs should have a search functionality...
 * throughout the app", explicitly including short fixed-option ones, not
 * just long data-driven lists). Rather than build a parallel component and
 * touch 40+ call sites, this *is* the app's <Select> now: same props
 * (children as plain <option> elements, name/id/value/defaultValue/
 * onChange/required/disabled/className), so every existing usage upgrades
 * automatically.
 *
 * A real (visually hidden but focusable/validatable) native <select> is
 * kept in sync underneath the visible combobox UI:
 * - FormData submission (Server Action <form action={...}> calls) keeps
 *   working with zero changes, since the thing actually inside the <form>
 *   is still a native <select name="...">.
 * - `required` still triggers native browser validation on submit.
 * - Existing `onChange={(e) => ... e.target.value}` handlers keep firing:
 *   picking an option sets the hidden select's value via the native
 *   property setter and dispatches a real "change" event, which React's
 *   synthetic event system picks up the same as a user interacting with a
 *   real <select> would.
 */
export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = useMemo(() => optionsFromChildren(children), [children]);
  const [hideLegacy] = useHideLegacy();

  const isControlled = value !== undefined;
  const toStr = (v: typeof value) => (v === undefined || v === null ? "" : String(Array.isArray(v) ? v[0] : v));

  const [internalValue, setInternalValue] = useState<string>(() =>
    isControlled ? toStr(value) : defaultValue !== undefined ? toStr(defaultValue) : (options[0]?.value ?? "")
  );
  // No effect needed to keep this synced with a controlled `value` prop —
  // currentValue below reads the live prop directly every render when
  // controlled; internalValue only matters in the uncontrolled case.
  const currentValue = isControlled ? toStr(value) : internalValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  // Listbox coordinates for the portal below (viewport-relative, since the
  // listbox is rendered position:fixed straight onto <body> — see comment
  // there for why).
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  function updateCoords() {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
  }

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      const insideContainer = containerRef.current?.contains(target);
      const insideList = listRef.current?.contains(target);
      if (!insideContainer && !insideList) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Keep the portal-rendered listbox glued to its trigger while open — it's
  // position:fixed (viewport-relative), so unlike the old in-flow
  // position:absolute it does NOT move automatically when an ancestor
  // scrolls (e.g. a table wrapped in overflow-x-auto — see the listbox
  // comment below) or the window resizes.
  useEffect(() => {
    if (!open) return;
    updateCoords();
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open]);

  const visibleOptions = useMemo(() => {
    const base = hideLegacy ? options.filter((o) => !o.legacy) : options;
    if (!query.trim()) return base;
    const q = query.trim().toLowerCase();
    return base.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, hideLegacy, query]);

  // If the currently-selected value would be hidden by the legacy filter,
  // still show its real label in the closed input (never hide the user's
  // own existing selection just because a toggle changed) — it just won't
  // reappear in the open dropdown's list.
  const selectedOption = options.find((o) => o.value === currentValue);

  // Derived, not stored: clamp render-time instead of syncing via an effect
  // (visibleOptions can shrink — e.g. the legacy filter toggling on, or a
  // search query narrowing the list — out from under a stale index).
  const safeHighlight = Math.min(highlight, Math.max(0, visibleOptions.length - 1));

  function commit(newValue: string) {
    if (!isControlled) setInternalValue(newValue);
    setOpen(false);
    setQuery("");
    const select = selectRef.current;
    if (select) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
      setter?.call(select, newValue);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // Bug found live (2 Sept 2026, Purchase's Unit/Sample unit fields): the
  // hidden native <select> below only had its DOM value set inside
  // commit() — i.e. only when a user clicked/keyboard-selected an option
  // through THIS component's own dropdown. A caller that sets a
  // controlled `value` prop programmatically (e.g. Purchase auto-filling
  // Unit/Sample unit the moment an item is picked, never going through
  // this component's commit()) left the hidden select's real DOM value
  // stuck on its stale/initial one — `defaultValue` only applies once, at
  // mount, and React never re-applies it. The visible combobox looked
  // correctly filled in, but the invisible native <select> the browser's
  // own `required` constraint validation checks was still empty, so
  // clicking Submit silently failed with "Please select an item in the
  // list." and never even reached the Server Action. Keep the hidden
  // select's DOM value synced to currentValue on every change, covering
  // both this case and the ordinary commit() case (already redundant
  // there, but harmless) — no change event dispatched here, since this
  // effect is a RESULT of currentValue changing, not the source of one.
  useEffect(() => {
    const select = selectRef.current;
    if (!select || select.value === currentValue) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, currentValue);
  }, [currentValue]);

  function openList() {
    if (disabled) return;
    updateCoords();
    setOpen(true);
    setQuery("");
    setHighlight(Math.max(0, options.findIndex((o) => o.value === currentValue)));
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Real, form-submittable select — visually hidden, not display:none,
          so native `required` validation still targets a rendered element. */}
      <select
        ref={selectRef}
        name={name}
        id={id}
        required={required}
        disabled={disabled}
        defaultValue={currentValue}
        onChange={onChange}
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={open ? query : (selectedOption?.label ?? "")}
          placeholder={selectedOption?.label ?? "Select…"}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) return openList();
              setHighlight((h) => Math.min(visibleOptions.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const opt = visibleOptions[safeHighlight];
              if (opt && !opt.disabled) commit(opt.value);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            } else if (e.key === "Tab") {
              setOpen(false);
              setQuery("");
            }
          }}
          className={cn(
            "w-full rounded-md border border-border bg-white px-3 py-2 pr-8 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand disabled:bg-black/5 disabled:text-muted",
            className
          )}
        />
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted" />
      </div>

      {/* Rendered via a portal straight onto <body>, position:fixed at
          `coords` (computed from the trigger's own bounding rect above),
          rather than position:absolute in normal flow. A ~40-picker sweep
          found several of these inside a table wrapped in
          `overflow-x-auto` (MFR recipe lines, FP compose's RM batch pick)
          — an absolutely-positioned descendant gets silently clipped by
          that ancestor's overflow, so the list was rendering but never
          visible. Portaling to <body> escapes that ancestor entirely; the
          scroll/resize listeners above keep it glued to the trigger. */}
      {open &&
        coords &&
        createPortal(
          <ul
            ref={listRef}
            id={id ? `${id}-listbox` : undefined}
            role="listbox"
            style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width }}
            className="z-50 max-h-56 overflow-auto rounded-md border border-border bg-white py-1 text-sm shadow-lg"
          >
            {visibleOptions.length === 0 && <li className="px-3 py-2 text-muted">No matches</li>}
            {visibleOptions.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === currentValue}
                onMouseDown={(e) => {
                  // Prevent the input's onBlur/outside-click handler from
                  // closing the list before the click registers.
                  e.preventDefault();
                  if (!o.disabled) commit(o.value);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5",
                  i === safeHighlight && "bg-brand/10",
                  o.disabled && "cursor-not-allowed text-muted"
                )}
              >
                <span>{o.label}</span>
                {o.value === currentValue && <Check className="h-3.5 w-3.5 text-brand-dark" />}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}

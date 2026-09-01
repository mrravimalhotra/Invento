"use client";

import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import type { ComponentProps, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

// Re-exported so every existing `import { Select } from "@/components/ui/form"`
// keeps working unchanged. Implementation moved to combobox.tsx 1 Sept 2026
// (Ravi: "all drop downs should have a search functionality to type and
// autocomplete through out the app") — see that file for why.
export { Select } from "@/components/ui/combobox";

const fieldBase =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand disabled:bg-black/5 disabled:text-muted";

export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-red ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

export function PasswordInput({ className, id, ...props }: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      <input
        id={inputId}
        type={visible ? "text" : "password"}
        className={cn(fieldBase, "pr-9", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted hover:text-foreground"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, className)} {...props} />;
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 rounded border-border accent-[var(--brand)]" {...props} />
      {label}
    </label>
  );
}

export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="text-xs text-red">{children}</p>;
}

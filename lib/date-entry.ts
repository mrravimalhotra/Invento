// UX-10 (25 Oct 2026): dates are typed and shown as dd-mm-yyyy whatever the computer's
// language; forms still send yyyy-mm-dd. Pure helpers, used by components/ui/date-input.tsx.

/** "2026-10-05" → "05-10-2026"; anything else → "". */
export function isoToDmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/**
 * Typed text → "yyyy-mm-dd", or null when it is not a real date. Accepts d-m-yyyy with
 * "-", "/", "." or spaces between the parts, and 8 digits (ddmmyyyy). Day comes first.
 */
export function dmyToIso(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/.exec(t);
  if (!m) m = /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > days) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The message a date box shows, or "" when the text is fine. */
export function dateEntryError(
  text: string,
  { required, min, max }: { required?: boolean; min?: string; max?: string }
): string {
  if (text.trim() === "") return required ? "Enter a date (dd-mm-yyyy)." : "";
  const iso = dmyToIso(text);
  if (!iso) return "Enter a real date as dd-mm-yyyy, for example 05-10-2026.";
  if (min && iso < min) return `The date can't be before ${isoToDmy(min)}.`;
  if (max && iso > max) return `The date can't be after ${isoToDmy(max)}.`;
  return "";
}

// QC test results (0119, Ravi 12 Oct 2026). Round 1 (Quality Checker) types the result of
// every test on the item's / MFR's COA template; Round 2 (QC Reviewer) can edit them. If he
// edits any, his list is final; otherwise Round 1's stands. The certificate takes the final list.

export type QcResultLine = { seq: number; test: string; specification: string; result: string };

export const MIN_REASON_CHARS = 3;
export const MAX_RESULT_CHARS = 500;

/** Trimmed reason, or an error message when it is missing or shorter than the minimum. */
export function reasonError(text: string, what: string): string | null {
  return text.trim().length < MIN_REASON_CHARS
    ? `${what} is required (at least ${MIN_REASON_CHARS} characters).`
    : null;
}

/** Reads the hidden `results` field of a QC form. Null when it is not a well-formed list. */
export function parseResultLines(raw: string): QcResultLine[] | null {
  let value: unknown;
  try {
    value = JSON.parse(raw || "[]");
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  const lines: QcResultLine[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    lines.push({
      seq: Number(o.seq),
      test: String(o.test ?? ""),
      specification: String(o.specification ?? ""),
      result: String(o.result ?? "").trim(),
    });
  }
  return lines;
}

type TemplateLine = { seq: number; test: string; specification: string };

/**
 * Checks a submitted list against the COA template: the same tests and specifications in the
 * same order, every result within the length limit and (when `requireAll`) filled in. Returns
 * the lines to store (taken from the template, so the browser cannot change a test or
 * specification) or an error message.
 */
export function checkResultsAgainstTemplate(
  submitted: QcResultLine[],
  template: TemplateLine[],
  requireAll: boolean
): { ok: true; lines: QcResultLine[] } | { ok: false; error: string } {
  if (submitted.length !== template.length) {
    return { ok: false, error: "The test list does not match the COA template. Reload the page and try again." };
  }
  const lines: QcResultLine[] = [];
  for (let i = 0; i < template.length; i++) {
    const t = template[i];
    const s = submitted[i];
    if (Number(s.seq) !== t.seq || s.test !== t.test || s.specification !== t.specification) {
      return { ok: false, error: `The test "${t.test}" or its specification differs from the COA template. Reload the page and try again.` };
    }
    if (s.result.length > MAX_RESULT_CHARS) {
      return { ok: false, error: `The result for "${t.test}" must be ${MAX_RESULT_CHARS} characters or fewer.` };
    }
    if (requireAll && !s.result) {
      return { ok: false, error: `Enter the result for "${t.test}".` };
    }
    lines.push({ seq: t.seq, test: t.test, specification: t.specification, result: s.result });
  }
  return { ok: true, lines };
}

/** True when any result differs between two lists of the same tests. */
export function resultsDiffer(a: QcResultLine[], b: QcResultLine[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((l, i) => l.result.trim() !== (b[i]?.result ?? "").trim());
}

/** The results that count: the Reviewer's list when he edited any, otherwise Round 1's. */
export function finalResults(r: {
  checker_results: QcResultLine[] | null;
  reviewer_results: QcResultLine[] | null;
}): QcResultLine[] | null {
  return r.reviewer_results ?? r.checker_results;
}

/** Event names in qc_decision_history, as shown on screen. */
export const QC_EVENT_LABELS: Record<string, string> = {
  round1_approved: "Round 1: approved",
  round1_rejected: "Round 1: rejection proposed",
  sent_back: "Rejection sent back to the Quality Checker",
  round2_approved: "Round 2: approved",
  round2_rejected: "Round 2: rejected",
  voided: "Rejection voided",
};

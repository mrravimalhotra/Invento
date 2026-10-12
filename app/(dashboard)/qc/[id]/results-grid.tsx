"use client";

import { Input } from "@/components/ui/form";
import { MAX_RESULT_CHARS, type QcResultLine } from "@/lib/qc-results";

type Line = { seq: number; test: string; specification: string };

// The COA template's tests with a result box for each. `values` are the typed results, in the
// template's order. When `round1` is given (Round 2), Round 1's result is shown beside each box
// and a result the Reviewer changed is highlighted. The hidden `results` field carries the
// list to the server action.
export function ResultsGrid({
  lines,
  values,
  onChange,
  round1,
}: {
  lines: Line[];
  values: string[];
  onChange: (values: string[]) => void;
  round1?: QcResultLine[] | null;
}) {
  const payload = JSON.stringify(lines.map((l, i) => ({ ...l, result: values[i] ?? "" })));
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <input type="hidden" name="results" value={payload} />
      <table className="w-full text-sm">
        <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Test</th>
            <th className="px-3 py-2 font-medium">Specification</th>
            {round1 && <th className="px-3 py-2 font-medium">Round 1 result</th>}
            <th className="px-3 py-2 font-medium">{round1 ? "Final result" : "Result"}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const before = round1?.[i]?.result ?? "";
            const changed = !!round1 && (values[i] ?? "").trim() !== before.trim();
            return (
              <tr key={l.seq} className="border-t border-border align-top">
                <td className="px-3 py-2">{l.test}</td>
                <td className="px-3 py-2 text-muted">{l.specification}</td>
                {round1 && <td className="px-3 py-2">{before || "—"}</td>}
                <td className="px-3 py-2">
                  <Input
                    aria-label={`Result for ${l.test}`}
                    value={values[i] ?? ""}
                    maxLength={MAX_RESULT_CHARS}
                    onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
                    className={changed ? "border-amber bg-amber-bg" : undefined}
                  />
                  {changed && <p className="mt-1 text-xs text-amber">Changed from Round 1</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

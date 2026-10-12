import type { QcResultLine } from "@/lib/qc-results";

// Read-only list of test results. `compare` (Round 1's list) highlights what the Reviewer changed.
export function ResultsTable({ lines, compare }: { lines: QcResultLine[]; compare?: QcResultLine[] | null }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Test</th>
            <th className="px-3 py-2 font-medium">Specification</th>
            <th className="px-3 py-2 font-medium">Result</th>
            {compare && <th className="px-3 py-2 font-medium">Round 1 result</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const before = compare?.[i]?.result;
            const changed = compare != null && before !== undefined && before.trim() !== l.result.trim();
            return (
              <tr key={`${l.seq}-${i}`} className="border-t border-border align-top">
                <td className="px-3 py-2">{l.test}</td>
                <td className="px-3 py-2 text-muted">{l.specification}</td>
                <td className={`px-3 py-2 ${changed ? "bg-amber-bg font-medium text-amber" : ""}`}>{l.result || "—"}</td>
                {compare && <td className="px-3 py-2 text-muted">{changed ? before || "—" : ""}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

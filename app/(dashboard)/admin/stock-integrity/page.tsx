import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadWarning } from "@/components/ui/load-warning";
import { formatDateTime } from "@/lib/utils";

// SCAN-P3-05 / SCAN-P7-25 (Ravi, 12 Oct 2026). Stock is kept in two places: the
// inventory ledger (item level) and the remaining quantity on each batch. Every
// receipt, issue, write-off, rejection, reopen and undo has to change both. This
// page runs nine read-only comparisons (database function stock_integrity_check,
// migration 0114) and shows what does not agree. Nothing here changes data.
// Reload the page to run it again. System Administrator only.

// P7-25: the stock statement scans the whole ledger; measured at about 5 s for 5 million
// rows. The scan advises acting before the ledger passes about 3 million.
const LEDGER_WATCH_ROWS = 3_000_000;
const LEDGER_NOTE_ROWS = 2_000_000;

type CheckRow = { code: string; title: string; problems: number; sample: Record<string, unknown>[] | null };

function cell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function StockIntegrityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isSystemAdmin = user.roles.includes("system_admin");

  return (
    <div>
      <PageHeader
        title="Stock Integrity Check"
        description="Compares the inventory ledger with the quantity left on each batch, and looks for negative stock, wrong units, duplicate batch numbers and orphans. Read-only: it never changes data."
      />
      {!isSystemAdmin ? (
        <Card>
          <CardHeader title="Access restricted" />
          <CardBody className="text-sm text-muted">Only the System Administrator can run this check.</CardBody>
        </Card>
      ) : (
        <Results />
      )}
    </div>
  );
}

async function Results() {
  const supabase = await createClient();
  const [{ data, error }, { count: ledgerRows, error: countError }] = await Promise.all([
    supabase.rpc("stock_integrity_check"),
    supabase.from("inventory_ledger").select("id", { count: "exact", head: true }),
  ]);
  const checks = (data ?? []) as CheckRow[];
  const totalProblems = checks.reduce((n, c) => n + Number(c.problems ?? 0), 0);
  const ran = formatDateTime(new Date().toISOString());

  return (
    <div className="flex flex-col gap-6">
      <LoadWarning errors={[error, countError]} what="the stock integrity check" />

      {checks.length > 0 && (
        <p
          role="status"
          className={
            totalProblems === 0
              ? "rounded-md border border-brand/30 bg-brand-light px-3 py-2 text-sm text-brand-dark"
              : "rounded-md border border-red/40 bg-red-bg px-3 py-2 text-sm text-red"
          }
        >
          {totalProblems === 0
            ? `All ${checks.length} checks passed — the ledger and the batch figures agree. Run ${ran}.`
            : `${totalProblems.toLocaleString("en-IN")} difference${totalProblems === 1 ? "" : "s"} found in ${
                checks.filter((c) => c.problems > 0).length
              } of ${checks.length} checks. Run ${ran}. Do not correct anything by hand; note the items below and tell the developer.`}
        </p>
      )}

      <Card>
        <CardHeader title="Checks" />
        <CardBody className="flex flex-col gap-4">
          {checks.map((c) => (
            <div key={c.code} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-muted">{c.code}</span>
                <span className="text-sm font-medium">{c.title}</span>
                <span className={c.problems === 0 ? "text-sm text-brand-dark" : "text-sm font-medium text-red"}>
                  {c.problems === 0 ? "OK" : `${c.problems.toLocaleString("en-IN")} found`}
                </span>
              </div>
              {c.problems > 0 && c.sample && c.sample.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-black/5 text-muted">
                      <tr>
                        {Object.keys(c.sample[0]).map((k) => (
                          <th key={k} className="px-2 py-1 font-medium">
                            {k.replace(/_/g, " ")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.sample.map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          {Object.keys(c.sample![0]).map((k) => (
                            <td key={k} className="px-2 py-1 font-mono">
                              {cell(row[k])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {c.problems > c.sample.length && (
                    <p className="border-t border-border px-2 py-1 text-xs text-muted">
                      Showing the first {c.sample.length} of {c.problems.toLocaleString("en-IN")}.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ledger size" />
        <CardBody className="flex flex-col gap-1 text-sm">
          <p>
            Inventory ledger rows:{" "}
            <span className="font-medium">{ledgerRows !== null && ledgerRows !== undefined ? ledgerRows.toLocaleString("en-IN") : "—"}</span>
          </p>
          <p className="text-muted">
            The Stock Statement and the stock reports read the whole ledger, so they slow down as it grows: about 1 second at
            1 million rows and about 5 seconds at 5 million, and the hosted database stops a request at 8 seconds. Plan the
            closing-balance table before the ledger passes {LEDGER_WATCH_ROWS.toLocaleString("en-IN")} rows.
          </p>
          {ledgerRows !== null && ledgerRows !== undefined && ledgerRows >= LEDGER_WATCH_ROWS ? (
            <p className="font-medium text-red">The ledger has passed {LEDGER_WATCH_ROWS.toLocaleString("en-IN")} rows — tell the developer now.</p>
          ) : ledgerRows !== null && ledgerRows !== undefined && ledgerRows >= LEDGER_NOTE_ROWS ? (
            <p className="font-medium text-amber">The ledger is approaching {LEDGER_WATCH_ROWS.toLocaleString("en-IN")} rows — tell the developer.</p>
          ) : (
            <p className="text-brand-dark">Well below the watch level.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

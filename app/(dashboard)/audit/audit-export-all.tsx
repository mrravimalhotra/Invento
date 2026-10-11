"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadAuditExport } from "@/lib/actions/audit-export";
import { exportTable, type TableExport } from "@/lib/table-export";
import type { AuditFilter } from "@/lib/audit-query";

type ExportRow = {
  when: string;
  table: string;
  record: string;
  action: string;
  by: string;
  via: string;
  summary: string;
  before: string;
  after: string;
};

const CONFIG: TableExport<ExportRow> = {
  title: "Audit Log",
  filename: "audit-log-all",
  formats: ["excel"],
  columns: [
    { header: "When", type: "datetime", value: (r) => r.when },
    { header: "Table", value: (r) => r.table },
    { header: "Record", value: (r) => r.record },
    { header: "Action", value: (r) => r.action },
    { header: "Changed By", value: (r) => r.by },
    { header: "Via", value: (r) => r.via },
    { header: "What changed", value: (r) => r.summary },
    { header: "Before", value: (r) => r.before },
    { header: "After", value: (r) => r.after },
  ],
};

// SCAN-P1-15: Excel file of every change that matches the filters (not only the page on screen).
export function AuditExportAll({ filter, disabled }: { filter: AuditFilter; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await loadAuditExport(filter);
      if (res.error) {
        setMessage(res.error);
        return;
      }
      const note = res.truncated
        ? `Only the newest ${res.rows.length.toLocaleString("en-IN")} changes are included — narrow the dates to get the rest.`
        : undefined;
      await exportTable({ ...CONFIG, note }, "excel", res.rows, { search: "", hideLegacy: false, filterText: res.filterText });
      if (note) setMessage(note);
    } catch {
      setMessage("Couldn't prepare the file. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" disabled={busy || disabled} onClick={run}>
        <Download className="h-3.5 w-3.5" />
        {busy ? "Preparing…" : "Download all matching (Excel)"}
      </Button>
      {message && <p role="status" className="text-xs text-red">{message}</p>}
    </div>
  );
}

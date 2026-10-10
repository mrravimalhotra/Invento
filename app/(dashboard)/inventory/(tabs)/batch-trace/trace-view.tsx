"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatQty } from "@/lib/utils";
import { exportTable, type TableExport } from "@/lib/table-export";

export type TraceKind = "purchase" | "fp" | "production";

// One row of trace_batch() (migration 0106). Quantities arrive as numbers or
// numeric strings depending on size, so every figure goes through Number().
export type TraceRow = {
  depth: number;
  direction: "root" | "backward" | "forward";
  relation: string;
  node_kind:
    | "purchase_batch"
    | "fp_batch"
    | "production_batch"
    | "packaging_issue"
    | "purchase_order"
    | "qc"
    | "coa"
    | "samples"
    | "wastage"
    | "rejected";
  node_id: string | null;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  batch_label: string | null;
  ref_code: string | null;
  quantity: string | number | null;
  unit: string | null;
  remaining: string | number | null;
  status: string | null;
  ar_number: string | null;
  event_at: string | null;
  note: string | null;
};

const NODE_LABEL: Record<TraceRow["node_kind"], string> = {
  purchase_batch: "Material batch",
  fp_batch: "Finished product batch",
  production_batch: "Production raw material",
  packaging_issue: "Packaging issue",
  purchase_order: "Purchase order",
  qc: "QC record",
  coa: "COA",
  samples: "Samples",
  wastage: "Wastage",
  rejected: "Rejected",
};

const TRACE_KIND: Partial<Record<TraceRow["node_kind"], TraceKind>> = {
  purchase_batch: "purchase",
  fp_batch: "fp",
  production_batch: "production",
};

const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));
const qtyText = (r: TraceRow) => {
  const q = num(r.quantity);
  return q === null ? "" : `${formatQty(q)}${r.unit ? ` ${r.unit}` : ""}`;
};

// The department of a packaging issue is the first word of its note ("Store · bulk used …").
const deptOf = (r: TraceRow) => (r.note ?? "").split(" · ")[0] || "Other";

function summarise(rows: TraceRow[]) {
  const forward = rows.filter((r) => r.direction === "forward");
  const fpIds = new Set(forward.filter((r) => r.node_kind === "fp_batch" && r.node_id).map((r) => r.node_id as string));
  const rootFp = rows.find((r) => r.direction === "root" && r.node_kind === "fp_batch");
  if (rootFp?.node_id) fpIds.add(rootFp.node_id);
  const seenIssue = new Set<string>();
  const packs = new Map<string, number>();
  for (const r of forward) {
    if (r.node_kind !== "packaging_issue" || !r.node_id || seenIssue.has(r.node_id)) continue;
    seenIssue.add(r.node_id);
    // Only issues that hold finished product count as packs sent on; for a packing
    // material batch the issue is where it was used, so it is counted the same way.
    packs.set(deptOf(r), (packs.get(deptOf(r)) ?? 0) + (num(r.quantity) ?? 0));
  }
  const root = rows.find((r) => r.direction === "root");
  const sum = (kind: TraceRow["node_kind"]) =>
    forward.filter((r) => r.node_kind === kind).reduce((s, r) => s + (num(r.quantity) ?? 0), 0);
  return {
    fpCount: fpIds.size,
    packs: Array.from(packs.entries()),
    remaining: root && num(root.remaining) !== null ? `${formatQty(num(root.remaining) as number)} ${root.unit ?? ""}` : null,
    wastage: sum("wastage"),
    rejected: sum("rejected"),
    unit: root?.unit ?? "",
    packCount: seenIssue.size,
  };
}

function Cell({ r }: { r: TraceRow }) {
  const label = r.node_kind === "fp_batch" || r.node_kind === "purchase_batch" || r.node_kind === "production_batch" || r.node_kind === "packaging_issue"
    ? r.batch_label
    : null;
  const href =
    r.node_kind === "fp_batch" && r.node_id
      ? `/finished-product/${r.node_id}`
      : r.item_id
        ? `/inventory/items/${r.item_id}`
        : null;
  const traceKind = TRACE_KIND[r.node_kind];
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[11px] uppercase tracking-wide text-muted">{NODE_LABEL[r.node_kind]}</span>
        {label && (href ? <Link href={href} className="font-medium hover:underline">{label}</Link> : <span className="font-medium">{label}</span>)}
        {!label && r.ref_code && <span className="font-medium">{r.ref_code}</span>}
        {traceKind && r.node_id && r.direction !== "root" && (
          <Link href={`/inventory/batch-trace?kind=${traceKind}&id=${r.node_id}`} className="text-xs text-brand-dark hover:underline">
            Trace this
          </Link>
        )}
      </div>
      {r.item_name && (
        <div className="text-xs text-muted">
          {r.item_name} · {r.item_code}
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, rows }: { title: string; hint: string; rows: TraceRow[] }) {
  return (
    <Card>
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted">Nothing recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-2">Step</th>
                <th className="px-4 py-2">Batch / record</th>
                <th className="px-4 py-2">Quantity</th>
                <th className="px-4 py-2">In stock now</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">AR / reference</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.node_id ?? r.relation}-${i}`} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-2">
                    <div style={{ paddingLeft: Math.max(r.depth - 1, 0) * 18 }} className="whitespace-nowrap text-xs">
                      {r.depth > 1 && <span className="mr-1 text-muted">↳</span>}
                      {r.relation}
                    </div>
                  </td>
                  <td className="px-4 py-2"><Cell r={r} /></td>
                  <td className="whitespace-nowrap px-4 py-2">{qtyText(r) || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {num(r.remaining) !== null ? `${formatQty(num(r.remaining) as number)} ${r.unit ?? ""}` : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {r.status && r.status !== "not_submitted" ? <Badge status={r.status}>{r.status.replace(/_/g, " ")}</Badge> : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs">
                    {[r.ar_number, r.ref_code].filter((v, idx, a) => v && a.indexOf(v) === idx).join(" · ") || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs">{r.event_at ? formatDate(r.event_at) : "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted">{r.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function TraceView({ rows }: { rows: TraceRow[] }) {
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const root = rows.find((r) => r.direction === "root");
  const back = rows.filter((r) => r.direction === "backward");
  const fwd = rows.filter((r) => r.direction === "forward");
  const s = summarise(rows);
  if (!root) return null;

  const exportConfig: TableExport<TraceRow> = {
    title: `Batch Trace — ${root.batch_label ?? ""}`,
    filename: `batch-trace-${(root.batch_label ?? "batch").replace(/[^A-Za-z0-9_-]+/g, "-")}`,
    formats: ["excel", "pdf"],
    columns: [
      { header: "Direction", value: (r) => (r.direction === "root" ? "Batch" : r.direction === "backward" ? "Made from" : "Went to") },
      { header: "Level", type: "number", decimals: 0, value: (r) => r.depth },
      { header: "Step", value: (r) => r.relation },
      { header: "Type", value: (r) => NODE_LABEL[r.node_kind] },
      { header: "Item code", value: (r) => r.item_code },
      { header: "Item", value: (r) => r.item_name },
      { header: "Batch / record", value: (r) => r.batch_label ?? r.ref_code },
      { header: "Quantity", type: "number", decimals: 3, value: (r) => num(r.quantity) },
      { header: "Unit", value: (r) => r.unit },
      { header: "In stock now", type: "number", decimals: 3, value: (r) => num(r.remaining) },
      { header: "Status", value: (r) => r.status },
      { header: "AR No.", value: (r) => r.ar_number },
      { header: "Reference", value: (r) => r.ref_code },
      { header: "Date", type: "date", value: (r) => r.event_at },
      { header: "Detail", value: (r) => r.note },
    ],
  };

  async function run(format: "excel" | "pdf") {
    setExporting(format);
    try {
      await exportTable(exportConfig, format, rows, { search: "", hideLegacy: false, filterText: `Trace of ${root?.batch_label ?? ""}` });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted">{NODE_LABEL[root.node_kind]}</div>
            <div className="text-lg font-semibold">{root.batch_label}</div>
            <div className="text-sm text-muted">
              {root.item_name} · {root.item_code}
              {qtyText(root) && ` · ${qtyText(root)}`}
              {root.status && root.status !== "not_submitted" && (
                <>
                  {" · "}
                  <Badge status={root.status}>{root.status.replace(/_/g, " ")}</Badge>
                </>
              )}
            </div>
            {root.note && <div className="text-xs text-muted">{root.note}</div>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={exporting !== null} onClick={() => run("excel")}>
              <Download className="h-3.5 w-3.5" />
              {exporting === "excel" ? "Preparing…" : "Excel"}
            </Button>
            <Button size="sm" variant="secondary" disabled={exporting !== null} onClick={() => run("pdf")}>
              <Download className="h-3.5 w-3.5" />
              {exporting === "pdf" ? "Preparing…" : "PDF"}
            </Button>
          </div>
        </div>
        <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-card p-3">
            <div className="text-xs text-muted">Finished product batches reached</div>
            <div className="text-base font-semibold">{s.fpCount}</div>
          </div>
          <div className="bg-card p-3">
            <div className="text-xs text-muted">Packs issued ({s.packCount} issue{s.packCount === 1 ? "" : "s"})</div>
            <div className="text-base font-semibold">
              {s.packs.length === 0 ? "—" : s.packs.map(([d, n]) => `${d} ${formatQty(n)}`).join(" · ")}
            </div>
          </div>
          <div className="bg-card p-3">
            <div className="text-xs text-muted">Still in stock</div>
            <div className="text-base font-semibold">{s.remaining ?? "—"}</div>
          </div>
          <div className="bg-card p-3">
            <div className="text-xs text-muted">Wastage · Rejected</div>
            <div className="text-base font-semibold">
              {formatQty(s.wastage)} · {formatQty(s.rejected)} {s.unit}
            </div>
          </div>
        </div>
      </Card>

      <Section title="Made from" hint="Going backward: the materials and batches this batch was made from." rows={back} />
      <Section title="Went to" hint="Going forward: what the batch was used in, packed as, sampled, written off or rejected." rows={fwd} />
    </div>
  );
}

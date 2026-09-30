"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { StatCard, Card, CardHeader, CardBody } from "@/components/ui/card";
import { HideLegacyToggle } from "@/components/ui/hide-legacy-toggle";
import { PageHeader } from "@/components/ui/page-header";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";
import { formatDate, isLegacyCode, todayIst } from "@/lib/utils";
import type { AlertRow } from "./dashboard-alerts";
import { DashboardCharts } from "./charts";

// ACC-26 (29 Sept 2026): the "Hide legacy data" switch lives in the browser,
// so the Dashboard can't decide server-side what to leave out. The server
// sends every count twice (all rows, and rows that are not legacy) and every
// chart row with a legacy flag; this component picks according to the switch.
// It uses the same test as every list: a LEG- code.

export type CountPair = { all: number; nonLegacy: number };
export type QcStatusCounts = Record<"submitted" | "checker_approved" | "approved" | "rejected", CountPair>;

export type DashboardData = {
  rawMaterials: CountPair;
  vendors: CountPair;
  mfrs: CountPair;
  finishedBatches: CountPair;
  pos30: CountPair;
  qc: QcStatusCounts;
  lowStock: { id: string; name: string; item_code: string; threshold: string | number; onHand: number }[];
  retestSoon: AlertRow[];
  expirySoon: AlertRow[];
  ledger30: { event_type: string; event_at: string; quantity: number; legacy: boolean }[];
  purchase30: { created_at: string; value: number; legacy: boolean }[];
  fp30: { created_at: string; legacy: boolean }[];
  days: string[];
};

const MAX_ALERTS = 8;

function daysUntil(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayIst()}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// B15: one alert — what it is (item, batch, Raw material / Finished product) and when.
function AlertLine({ row, verb, href }: { row: AlertRow; verb: "retest" | "expires"; href: string }) {
  const days = daysUntil(row.date);
  return (
    <Link href={href} className="flex items-start gap-2 text-sm hover:underline">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 text-amber shrink-0" />
      <span>
        <span className="font-medium">{row.title}</span> · {row.batch}
        <span
          className={`ml-2 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold no-underline ${
            row.kind === "fp" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"
          }`}
        >
          {row.kind === "fp" ? "Finished product" : "Raw material"}
        </span>
        <span className="block text-xs text-muted">
          {row.ar ? `${row.ar} · ` : ""}
          {verb} {formatDate(row.date)} · {days <= 0 ? "today" : days === 1 ? "in 1 day" : `in ${days} days`}
        </span>
      </span>
    </Link>
  );
}

export function DashboardView({ data }: { data: DashboardData }) {
  const [hideLegacy] = useHideLegacy();
  const pick = (c: CountPair) => (hideLegacy ? c.nonLegacy : c.all);
  const keep = <T extends { legacy: boolean }>(rows: T[]) => (hideLegacy ? rows.filter((r) => !r.legacy) : rows);

  const qc = {
    submitted: pick(data.qc.submitted),
    checker_approved: pick(data.qc.checker_approved),
    approved: pick(data.qc.approved),
    rejected: pick(data.qc.rejected),
  };
  const pendingQc = qc.submitted + qc.checker_approved;

  const lowStock = hideLegacy ? data.lowStock.filter((it) => !isLegacyCode(it.item_code)) : data.lowStock;
  const retestAll = keep(data.retestSoon);
  const expiryAll = keep(data.expirySoon);
  const retestSoon = retestAll.slice(0, MAX_ALERTS);
  const expirySoon = expiryAll.slice(0, MAX_ALERTS);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Live from the same tables every other module writes to — no separate reporting layer."
        action={<HideLegacyToggle />}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Raw materials" value={pick(data.rawMaterials)} href="/items" />
        <StatCard label="Vendors" value={pick(data.vendors)} href="/vendors" />
        <StatCard label="MFR definitions" value={pick(data.mfrs)} href="/mfr" />
        <StatCard label="Finished batches" value={pick(data.finishedBatches)} href="/finished-product" />
        <StatCard label="POs (30d)" value={pick(data.pos30)} href="/purchase" />
        <StatCard label="Pending QC" value={pendingQc} href="/qc" />
      </div>

      {(lowStock.length > 0 || retestSoon.length > 0 || expirySoon.length > 0) && (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lowStock.length > 0 && (
            <Card className="border-amber/40">
              <CardHeader title="Low stock" />
              <CardBody className="flex flex-col gap-2">
                {lowStock.slice(0, 6).map((it) => (
                  <Link key={it.id} href="/items" className="flex items-center gap-2 text-sm hover:underline">
                    <TriangleAlert className="h-3.5 w-3.5 text-amber shrink-0" />
                    {it.name} ({it.item_code}) — {it.onHand.toLocaleString("en-IN")} on hand, threshold {it.threshold}
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
          {retestSoon.length > 0 && (
            <Card className="border-amber/40">
              <CardHeader title="Retest due in the next 90 days" />
              <CardBody className="flex flex-col gap-3">
                {retestSoon.map((q) => (
                  <AlertLine key={q.key} row={q} verb="retest" href="/qc" />
                ))}
                {retestAll.length > retestSoon.length && (
                  <Link href="/qc" className="text-xs font-medium text-brand hover:underline">
                    + {retestAll.length - retestSoon.length} more on the QC page
                  </Link>
                )}
              </CardBody>
            </Card>
          )}
          {expirySoon.length > 0 && (
            <Card className="border-amber/40">
              <CardHeader title="Finished product expiring in the next 90 days" />
              <CardBody className="flex flex-col gap-3">
                {expirySoon.map((q) => (
                  <AlertLine key={q.key} row={q} verb="expires" href="/finished-product" />
                ))}
                {expiryAll.length > expirySoon.length && (
                  <Link href="/finished-product" className="text-xs font-medium text-brand hover:underline">
                    + {expiryAll.length - expirySoon.length} more on the Finished Product page
                  </Link>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <div className="mt-6">
        <DashboardCharts
          qcCounts={qc}
          ledger30={keep(data.ledger30)}
          purchase30={keep(data.purchase30)}
          fp30={keep(data.fp30)}
          days={data.days}
        />
      </div>
    </div>
  );
}

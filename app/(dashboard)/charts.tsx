"use client";

import { Card, CardHeader, CardBody } from "@/components/ui/card";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { dailySeries, dayLabel } from "@/lib/dashboard-series";
import { formatNumber } from "@/lib/utils";

const BRAND = "#1f6f4e";
const AMBER = "#b45309";
const RED = "#b91c1c";
const MUTED = "#94a3a0";
// Two-round QC review (20 Sept 2026) — distinct color for the new
// "checker_approved / Awaiting Review" slice, so it reads apart from the
// pre-existing amber "Submitted" slice on the same pie.
const BLUE = "#2563eb";

export type DashboardChartData = {
  qcCounts: { submitted: number; checker_approved: number; approved: number; rejected: number };
  ledger30: { event_type: string; event_at: string; quantity: number }[];
  purchase30: { created_at: string; value: number }[];
  fp30: { created_at: string }[];
  // The 30 India-time calendar days the charts cover, oldest first.
  days: string[];
};

export function DashboardCharts({ qcCounts, ledger30, purchase30, fp30, days }: DashboardChartData) {
  // ACC-26: every series uses the same 30 days, in date order, with 0 on
  // days when nothing happened.
  const push = dailySeries(ledger30.filter((l) => l.event_type === "push"), days, (r) => r.event_at, (r) => Number(r.quantity));
  const pull = dailySeries(ledger30.filter((l) => l.event_type !== "push"), days, (r) => r.event_at, (r) => Number(r.quantity));
  const movement = days.map((day, i) => ({ day: dayLabel(day), push: push[i].value, pull: pull[i].value }));

  const purchaseValue = dailySeries(purchase30, days, (r) => r.created_at, (r) => r.value).map((p) => ({
    day: dayLabel(p.day),
    value: Math.round(p.value * 100) / 100,
  }));
  const fpByDay = dailySeries(fp30, days, (r) => r.created_at, () => 1).map((p) => ({ day: dayLabel(p.day), value: p.value }));

  const qcPie = [
    { name: "Submitted", value: qcCounts.submitted, color: AMBER },
    { name: "Awaiting Review", value: qcCounts.checker_approved, color: BLUE },
    { name: "Approved", value: qcCounts.approved, color: BRAND },
    { name: "Rejected", value: qcCounts.rejected, color: RED },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader title="Inventory movement — last 30 days" />
        <CardBody className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={movement}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e5" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="push" name="Stock In" stroke={BRAND} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pull" name="Stock Out" stroke={AMBER} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="QC by status" />
        <CardBody className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={qcPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                {qcPie.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Purchase value (incl. GST) — last 30 days" />
        <CardBody className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={purchaseValue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e5" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `₹ ${formatNumber(Number(v))}`} />
              <Line type="monotone" dataKey="value" name="Value" stroke={BRAND} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Finished batches — last 30 days" />
        <CardBody className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fpByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e5" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Batches" fill={MUTED} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
    </div>
  );
}

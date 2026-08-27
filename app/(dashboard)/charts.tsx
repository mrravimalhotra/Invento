"use client";

import { Card, CardHeader, CardBody } from "@/components/ui/card";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { format } from "date-fns";

const BRAND = "#1f6f4e";
const AMBER = "#b45309";
const RED = "#b91c1c";
const MUTED = "#94a3a0";

function byDay<T>(rows: T[], dateKey: keyof T, valueFn: (r: T) => number) {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    const day = format(new Date(r[dateKey] as string), "MMM d");
    map.set(day, (map.get(day) ?? 0) + valueFn(r));
  });
  return Array.from(map.entries()).map(([day, value]) => ({ day, value }));
}

export function DashboardCharts({
  qcCounts,
  ledger30,
  purchase30,
  fp30,
}: {
  qcCounts: { submitted: number; approved: number; rejected: number };
  ledger30: { event_type: string; event_at: string; quantity: number }[];
  purchase30: { created_at: string; quantity: number; unit_price: number | null }[];
  fp30: { created_at: string }[];
}) {
  const push = byDay(
    ledger30.filter((l) => l.event_type === "push"),
    "event_at",
    (r) => Number(r.quantity)
  );
  const pull = byDay(
    ledger30.filter((l) => l.event_type !== "push"),
    "event_at",
    (r) => Number(r.quantity)
  );
  const movementDays = Array.from(new Set([...push.map((p) => p.day), ...pull.map((p) => p.day)]));
  const movement = movementDays.map((day) => ({
    day,
    push: push.find((p) => p.day === day)?.value ?? 0,
    pull: pull.find((p) => p.day === day)?.value ?? 0,
  }));

  const purchaseValue = byDay(purchase30, "created_at", (r) => Number(r.quantity) * Number(r.unit_price ?? 0));
  const fpByDay = byDay(fp30.map((r) => ({ ...r, one: 1 })), "created_at", () => 1);

  const qcPie = [
    { name: "Submitted", value: qcCounts.submitted, color: AMBER },
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
              <Line type="monotone" dataKey="push" name="Push" stroke={BRAND} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="pull" name="Pull" stroke={AMBER} strokeWidth={2} dot={false} />
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
        <CardHeader title="Purchase value — last 30 days" />
        <CardBody className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={purchaseValue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e5" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
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

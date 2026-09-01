import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/card";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { DashboardCharts } from "./charts";
import { formatDate } from "@/lib/utils";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { HideLegacyToggle } from "@/components/ui/hide-legacy-toggle";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: itemCount },
    { count: vendorCount },
    { count: mfrCount },
    { count: fpCount },
    { count: poThisMonth },
    { count: pendingQc },
    { data: qcAll },
    { data: ledger30 },
    { data: purchase30 },
    { data: fp30 },
    { data: retestSoon },
    { data: items },
    { data: balances },
  ] = await Promise.all([
    supabase.from("items").select("*", { count: "exact", head: true }).eq("category", "raw").eq("active", true),
    supabase.from("vendors").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("mfr_definitions").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("finished_product_batches").select("*", { count: "exact", head: true }),
    supabase.from("purchase_orders").select("*", { count: "exact", head: true }).gte("created_at", daysAgo(30)),
    supabase.from("quality_checks").select("*", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("quality_checks").select("status"),
    supabase.from("inventory_ledger").select("event_type, event_at, quantity").gte("event_at", daysAgo(30)),
    supabase.from("purchase_lines").select("created_at, quantity, unit_price").gte("created_at", daysAgo(30)),
    supabase.from("finished_product_batches").select("created_at").gte("created_at", daysAgo(30)),
    supabase
      .from("quality_checks")
      .select("ar_number, retest_date, item_id, items(name)")
      .not("retest_date", "is", null)
      .gte("retest_date", new Date().toISOString().slice(0, 10))
      .lte("retest_date", daysAgo(-30).slice(0, 10))
      .order("retest_date", { ascending: true })
      .limit(5),
    supabase.from("items").select("id, name, item_code, low_stock_threshold").not("low_stock_threshold", "is", null).eq("active", true),
    supabase.from("stock_balance").select("item_id, on_hand"),
  ]);

  const qcCounts = { submitted: 0, approved: 0, rejected: 0 };
  (qcAll ?? []).forEach((q) => {
    if (q.status in qcCounts) qcCounts[q.status as keyof typeof qcCounts]++;
  });

  const balanceMap = new Map((balances ?? []).map((b) => [b.item_id, Number(b.on_hand)]));
  const lowStockItems = (items ?? []).filter(
    (it) => (balanceMap.get(it.id) ?? 0) < Number(it.low_stock_threshold)
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Live from the same tables every other module writes to — no separate reporting layer."
        action={<HideLegacyToggle />}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Raw materials" value={itemCount ?? 0} href="/items" />
        <StatCard label="Vendors" value={vendorCount ?? 0} href="/vendors" />
        <StatCard label="MFR definitions" value={mfrCount ?? 0} href="/mfr" />
        <StatCard label="Finished batches" value={fpCount ?? 0} href="/finished-product" />
        <StatCard label="POs (30d)" value={poThisMonth ?? 0} href="/purchase" />
        <StatCard label="Pending QC" value={pendingQc ?? 0} href="/qc" />
      </div>

      {(lowStockItems.length > 0 || (retestSoon?.length ?? 0) > 0) && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {lowStockItems.length > 0 && (
            <Card className="border-amber/40">
              <CardHeader title="Low stock" />
              <CardBody className="flex flex-col gap-2">
                {lowStockItems.slice(0, 6).map((it) => (
                  <Link key={it.id} href="/items" className="flex items-center gap-2 text-sm hover:underline">
                    <TriangleAlert className="h-3.5 w-3.5 text-amber shrink-0" />
                    {it.name} ({it.item_code}) — {formatNum(balanceMap.get(it.id))} on hand, threshold {it.low_stock_threshold}
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
          {(retestSoon?.length ?? 0) > 0 && (
            <Card className="border-amber/40">
              <CardHeader title="Retest due soon" />
              <CardBody className="flex flex-col gap-2">
                {retestSoon!.map((q) => (
                  <Link key={q.ar_number} href="/qc" className="flex items-center gap-2 text-sm hover:underline">
                    <TriangleAlert className="h-3.5 w-3.5 text-amber shrink-0" />
                    {q.ar_number} — retest {formatDate(q.retest_date)}
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <div className="mt-6">
        <DashboardCharts
          qcCounts={qcCounts}
          ledger30={ledger30 ?? []}
          purchase30={purchase30 ?? []}
          fp30={fp30 ?? []}
        />
      </div>
    </div>
  );
}

function formatNum(n?: number) {
  return n === undefined ? "0" : n.toLocaleString("en-IN");
}

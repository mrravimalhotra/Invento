import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/card";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { DashboardCharts } from "./charts";
import { formatDate, todayIst, toIstDateString } from "@/lib/utils";
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
    { count: qcSubmitted },
    { count: qcCheckerApproved },
    { count: qcApproved },
    { count: qcRejected },
    { data: ledger30 },
    { data: purchase30 },
    { data: fp30 },
    { data: retestSoon },
    { data: items },
  ] = await Promise.all([
    supabase.from("items").select("*", { count: "exact", head: true }).eq("category", "raw").eq("active", true),
    supabase.from("vendors").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("mfr_definitions").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("finished_product_batches").select("*", { count: "exact", head: true }),
    supabase.from("purchase_orders").select("*", { count: "exact", head: true }).gte("created_at", daysAgo(30)),
    // Two-round QC review (20 Sept 2026): "pending" now spans both rounds —
    // submitted (awaiting the QC Checker) and checker_approved (awaiting
    // the QC Reviewer) both still need a next action from someone.
    supabase.from("quality_checks").select("*", { count: "exact", head: true }).in("status", ["submitted", "checker_approved"]),
    // ACC-08 (29 Sept 2026): the QC chart counted statuses from a plain
    // select, capped at 1,000 rows (and so disagreeing with the Pending QC
    // card, which is an exact count). Exact counts per status instead.
    supabase.from("quality_checks").select("*", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("quality_checks").select("*", { count: "exact", head: true }).eq("status", "checker_approved"),
    supabase.from("quality_checks").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("quality_checks").select("*", { count: "exact", head: true }).eq("status", "rejected"),
    // ACC-08: the 30-day chart data is paged, so busy months aren't cut off
    // at 1,000 rows.
    fetchAllRows<{ event_type: string; event_at: string; quantity: number }>((from, to) =>
      supabase
        .from("inventory_ledger")
        .select("event_type, event_at, quantity")
        .gte("event_at", daysAgo(30))
        .order("event_at", { ascending: true })
        .order("seq", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<{ created_at: string; quantity: number; unit_price: number | null }>((from, to) =>
      supabase
        .from("purchase_lines")
        .select("created_at, quantity, unit_price")
        .gte("created_at", daysAgo(30))
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<{ created_at: string }>((from, to) =>
      supabase
        .from("finished_product_batches")
        .select("created_at")
        .gte("created_at", daysAgo(30))
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    supabase
      .from("quality_checks")
      .select("ar_number, retest_date, item_id, items(name)")
      .not("retest_date", "is", null)
      .gte("retest_date", todayIst())
      .lte("retest_date", toIstDateString(daysAgo(-30)))
      .order("retest_date", { ascending: true })
      .limit(5),
    fetchAllRows<{ id: string; name: string; item_code: string; low_stock_threshold: string | number }>((from, to) =>
      supabase
        .from("items")
        .select("id, name, item_code, low_stock_threshold")
        .not("low_stock_threshold", "is", null)
        .eq("active", true)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const qcCounts = {
    submitted: qcSubmitted ?? 0,
    checker_approved: qcCheckerApproved ?? 0,
    approved: qcApproved ?? 0,
    rejected: qcRejected ?? 0,
  };

  // ACC-08: balances only for the items that have a threshold, looked up in
  // chunks. Before, the whole stock_balance view was read in one capped
  // request, so an item outside the first 1,000 counted as 0 on hand and
  // showed as a false "Low stock".
  const { data: balances } = await fetchByIdChunks<{ item_id: string; on_hand: string | number }>(
    (items ?? []).map((it) => it.id),
    (chunk) => supabase.from("stock_balance").select("item_id, on_hand").in("item_id", chunk)
  );

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

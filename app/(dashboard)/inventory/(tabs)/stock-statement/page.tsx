import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { todayIst } from "@/lib/utils";
import { isIsoDate } from "@/lib/date-rules";
import { friendlyDbError } from "@/lib/db-errors";
import { StatementFilter } from "./statement-filter";
import { StatementTable, type StatementRow } from "./statement-table";

// Stock Statement (0107, Ravi 10 Oct 2026): for a date range, each item's
// opening stock, what came in, what went out and the closing stock. Read from
// the ledger by stock_statement(); closing for a To date of today equals On
// hand on Stock Position. Dates are India time.

const CATEGORIES = ["raw", "processed", "packaging", "packaged_fp"];

type StatementDbRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  category: string;
  unit: string | null;
  opening: string | number;
  purchased: string | number;
  produced: string | number;
  other_in: string | number;
  used_in_production: string | number;
  packaging: string | number;
  samples: string | number;
  wastage: string | number;
  rejected: string | number;
  other_out: string | number;
  closing: string | number;
};

const n = (v: string | number) => Number(v);

// First day of the month containing `day` (YYYY-MM-DD).
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

export default async function StockStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const today = todayIst();
  const to = isIsoDate(sp.to) && sp.to <= today ? sp.to : today;
  let from = isIsoDate(sp.from) && sp.from <= to ? sp.from : monthStart(to);
  if (from > to) from = to;
  const category = sp.category && CATEGORIES.includes(sp.category) ? sp.category : "";

  const supabase = await createClient();
  const res = await fetchAllRows<StatementDbRow>(async (a, b) => {
    const r = await supabase
      .rpc("stock_statement", { p_from: from, p_to: to, p_category: category || null })
      .order("item_code", { ascending: true })
      .order("item_id", { ascending: true })
      .range(a, b);
    return { data: r.data as unknown as StatementDbRow[] | null, error: r.error };
  });

  const rows: StatementRow[] = (res.data ?? []).map((r) => ({
    itemId: r.item_id,
    itemCode: r.item_code,
    itemName: r.item_name,
    category: r.category,
    unit: r.unit ?? "",
    opening: n(r.opening),
    purchased: n(r.purchased),
    produced: n(r.produced),
    otherIn: n(r.other_in),
    usedInProduction: n(r.used_in_production),
    packaging: n(r.packaging),
    samples: n(r.samples),
    wastage: n(r.wastage),
    rejected: n(r.rejected),
    otherOut: n(r.other_out),
    closing: n(r.closing),
  }));

  return (
    <Card>
      <StatementFilter from={from} to={to} category={category} today={today} />
      {res.error && <p className="border-b border-border p-4 text-sm text-red">{friendlyDbError(res.error)}</p>}
      <StatementTable rows={rows} from={from} to={to} />
    </Card>
  );
}

import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { InventoryLedgerTable, type LedgerRow } from "./inventory-ledger-table";
import { LedgerFilters, type ItemFilterOption } from "./ledger-filters";
import { enrichLedgerRows, type RawLedgerRow } from "@/lib/ledger-enrich";

const LEDGER_LIMIT = 1000;

type LedgerQueryRow = RawLedgerRow;

const REFERENCE_TYPES = new Set([
  "purchase",
  "qc",
  "qc_sample",
  "stability_sample",
  "rnd_sample",
  "finished_product",
  "fp_yield",
  "packaging",
]);

function isValidDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function InventoryLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; reference_type?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const itemId = params.item ?? "";
  const referenceType = REFERENCE_TYPES.has(params.reference_type ?? "") ? (params.reference_type as string) : "";
  const from = isValidDate(params.from) ? params.from : "";
  const to = isValidDate(params.to) ? params.to : "";

  const supabase = await createClient();

  // Phase 4 (claude/inventory-ledger-redesign.md) — queries
  // inventory_ledger_with_balance (0031_stock_position.sql) instead of the
  // base table, which adds a per-item running_balance column (see that
  // migration for why it needed a real insertion-order column rather than
  // ordering by event_at alone), and applies real server-side filters
  // instead of only the client-side text search DataTable already had —
  // the same row-cap-truncation lesson every other unfiltered query in
  // this app has already had to learn (claude/known-issues.md): filtering
  // 1,000 already-truncated rows client-side can silently miss matches
  // that never made it into that page in the first place.
  //
  // Ravi (14 Sept 2026): "first entry should be of Purchase(Push) and then
  // samples should be pulled out in order of Q, Stability & R&D to reflect
  // correct running balance." Root cause: submit_purchase_order()
  // (0028_ledger_sample_pull_fix.sql) inserts the push then the three
  // sample pulls inside one function call, so they all get the exact same
  // event_at — Postgres's now() is constant for the whole transaction, not
  // per-statement. This query only ever ordered by event_at, with no
  // tiebreaker, so SQL leaves the display order of same-instant rows
  // unspecified — it can (and, per Ravi, did) render a sample pull above
  // its own purchase push. The view's own running_balance figures were
  // never wrong (0031_stock_position.sql's window function already orders
  // by (event_at, seq), which is exactly push-then-qc-then-stability-then-
  // rnd, matching insertion order) — only this page's *display* order was
  // missing the same tiebreaker. Adding `seq` ascending as a secondary
  // sort key makes same-instant rows render in the order they actually
  // happened, so the numbers and the row order now agree.
  let query = supabase
    .from("inventory_ledger_with_balance")
    .select(
      "id, event_at, event_type, quantity, unit, department, reference_type, reference_id, event_by, running_balance, items(name, item_code), purchase_lines(batch_number)"
    )
    .order("event_at", { ascending: false })
    .order("seq", { ascending: true })
    .limit(LEDGER_LIMIT);
  if (itemId) query = query.eq("item_id", itemId);
  if (referenceType) query = query.eq("reference_type", referenceType);
  if (from) query = query.gte("event_at", `${from}T00:00:00`);
  if (to) query = query.lte("event_at", `${to}T23:59:59.999`);

  const [{ data, error }, { data: items }] = await Promise.all([
    query.returns<LedgerQueryRow[]>(),
    supabase
      .from("items")
      .select("id, item_code, name")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(5000)
      .returns<ItemFilterOption[]>(),
  ]);

  const ledgerRows = data ?? [];
  const rows: LedgerRow[] = await enrichLedgerRows(supabase, ledgerRows);

  return (
    <Card>
      <LedgerFilters items={items ?? []} itemId={itemId} referenceType={referenceType} from={from} to={to} />
      {error && <p className="p-4 text-sm text-red">{error.message}</p>}
      <InventoryLedgerTable rows={rows} ledgerLimit={LEDGER_LIMIT} />
    </Card>
  );
}

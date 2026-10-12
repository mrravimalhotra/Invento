import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { ItemsTable, type ItemRow } from "./items-table";
import { lowStockCheck } from "@/lib/low-stock";
import { LoadWarning } from "@/components/ui/load-warning";

type ItemQueryRow = {
  id: string;
  item_code: string;
  name: string;
  category: string;
  unit: string | null;
  active: boolean;
  low_stock_threshold: string | number | null;
  item_types: { description: string } | { description: string }[] | null;
  created_at: string;
};

type BalanceQueryRow = { item_id: string; on_hand: string | number };
type UsableQueryRow = { item_id: string; usable: string | number };
type CoaTemplateQueryRow = { item_id: string | null; mfr_definition_id: string | null };
type MfrLinkQueryRow = { id: string; finished_product_item_id: string | null };

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);

  // FB-0006: sort newest-first by created_at rather than alphabetically by
  // item_code. Alphabetical order buried freshly-created Raw material/
  // Packaging items (RM-/PKG-) behind ~1000 legacy-imported rows (prefixed
  // LEG-, which sorts before RM/PKG but after FP alphabetically), pushing
  // new items past DataTable's client-side 15-rows/page slice — a newly
  // added item was effectively invisible without searching or paging deep.
  //
  // known-issues.md ("Row-cap truncation") — with ~2,200+ active items on
  // file, a plain unbounded select() silently truncated at Supabase's
  // server-side max-rows cap (1,000, confirmed live via this page's own
  // "Page 1 of 67 · 1000 rows" footer) — the newest-first ordering above
  // only ever fixed a *picker* (new rows within the cap); it can't make a
  // list page that must show *every* row return more than the cap.
  // fetchAllRows pages both queries in max-rows-sized `.range()` windows
  // until each is exhausted, same fix already shipped for Stock Position.
  const [{ data: itemsData, error: itemsError }, { data: balances, error: balancesError }, { data: usables, error: usablesError }, { data: coaTemplates, error: coaError }, { data: mfrLinks, error: mfrError }] = await Promise.all([
    fetchAllRows<ItemQueryRow>((from, to) => {
      let query = supabase
        .from("items")
        .select("id, item_code, name, category, unit, active, low_stock_threshold, item_types(description), created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }) // ACC-07: unique tiebreaker so pages never overlap or skip
        .range(from, to);
      if (category && category !== "all") query = query.eq("category", category);
      return query.returns<ItemQueryRow[]>();
    }),
    fetchAllRows<BalanceQueryRow>((from, to) =>
      supabase
        .from("stock_balance")
        .select("item_id, on_hand")
        .order("item_id", { ascending: true })
        .range(from, to)
        .returns<BalanceQueryRow[]>()
    ),
    // SCAN-P3-10: raw material is flagged Low on usable stock, not on hand.
    fetchAllRows<UsableQueryRow>((from, to) =>
      supabase
        .from("item_stock_status")
        .select("item_id, usable")
        .order("item_id", { ascending: true })
        .range(from, to)
        .returns<UsableQueryRow[]>()
    ),
    // COA template status: a raw material has its own template; a finished product has the
    // template of the MFR that makes it (mfr_definitions.finished_product_item_id).
    fetchAllRows<CoaTemplateQueryRow>((from, to) =>
      supabase
        .from("coa_templates")
        .select("item_id, mfr_definition_id")
        .order("id", { ascending: true })
        .range(from, to)
        .returns<CoaTemplateQueryRow[]>()
    ),
    fetchAllRows<MfrLinkQueryRow>((from, to) =>
      supabase
        .from("mfr_definitions")
        .select("id, finished_product_item_id")
        .not("finished_product_item_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to)
        .returns<MfrLinkQueryRow[]>()
    ),
  ]);

  const balanceMap = new Map((balances ?? []).map((b) => [b.item_id, Number(b.on_hand)]));
  const usableMap = new Map((usables ?? []).map((u) => [u.item_id, Number(u.usable)]));

  const templateItemIds = new Set((coaTemplates ?? []).map((t) => t.item_id).filter((x): x is string => !!x));
  const templateMfrIds = new Set((coaTemplates ?? []).map((t) => t.mfr_definition_id).filter((x): x is string => !!x));
  const mfrByItem = new Map((mfrLinks ?? []).map((m) => [m.finished_product_item_id as string, m.id]));

  // "none": no COA for this kind of item; "no_mfr": a finished product with no MFR to hold a template.
  const coaFor = (it: ItemQueryRow): Pick<ItemRow, "coa" | "coaHref"> => {
    if (it.category === "raw") {
      return { coa: templateItemIds.has(it.id) ? "defined" : "missing", coaHref: `/items/${it.id}#coa-template` };
    }
    if (it.category === "processed") {
      const mfrId = mfrByItem.get(it.id);
      if (!mfrId) return { coa: "no_mfr", coaHref: null };
      return { coa: templateMfrIds.has(mfrId) ? "defined" : "missing", coaHref: `/mfr/${mfrId}#coa-template` };
    }
    return { coa: "none", coaHref: null };
  };

  const rows: ItemRow[] = (itemsData ?? []).map((it) => ({
    ...it,
    // Supabase types this as an array in TS but the FK is many-to-one; take the first.
    item_types: Array.isArray(it.item_types) ? it.item_types[0] ?? null : it.item_types,
    ...coaFor(it),
    on_hand: balanceMap.get(it.id) ?? 0,
    hasBalance: balanceMap.has(it.id),
    low: lowStockCheck({
      category: it.category,
      threshold: it.low_stock_threshold,
      onHand: balanceMap.get(it.id) ?? 0,
      usable: usableMap.get(it.id) ?? 0,
    }).low,
  })) as unknown as ItemRow[];

  const canCreate = canWrite(user?.roles ?? [], "items");

  const tabs = [
    { key: "all", label: "All" },
    { key: "raw", label: "Raw material" },
    { key: "packaging", label: "Packaging" },
    { key: "processed", label: "Finished product" },
    { key: "packaged_fp", label: "Packaged finished product" },
  ];
  const active = category && tabs.some((t) => t.key === category) ? category : "all";

  return (
    <div>
      <PageHeader
        title="Item Master"
        description="Raw materials, finished products, and packaging materials."
        action={canCreate ? <LinkButton href="/items/new">New item</LinkButton> : undefined}
      />
      <LoadWarning errors={[itemsError, balancesError, usablesError, coaError, mfrError]} what="the item list" />
      <div className="mb-4 flex gap-1.5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/items" : `/items?category=${t.key}`}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              active === t.key ? "bg-brand text-white" : "bg-black/5 text-muted hover:bg-black/10"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Card>
        <ItemsTable rows={rows} />
      </Card>
    </div>
  );
}

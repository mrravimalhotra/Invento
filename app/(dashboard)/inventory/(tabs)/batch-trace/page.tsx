import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { escapeLike, fpBatchBoth, formatQty } from "@/lib/utils";
import { TraceView, type TraceRow, type TraceKind } from "./trace-view";

// Batch Trace (0106, Ravi 10 Oct 2026): pick any batch — raw or packing
// material, production raw material, or finished product — and see what it was
// made from (backward) and where it went (forward), for a recall or an
// inspection. The walking is done in the database (trace_batch); this page
// finds the batch and shows the result.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: TraceKind[] = ["purchase", "fp", "production"];
const KIND_LABEL: Record<TraceKind, string> = {
  purchase: "Raw / packing material",
  production: "Raw material (from production)",
  fp: "Finished product",
};

type ItemRef = { item_code: string; name: string } | null;
type PurchaseHit = { id: string; batch_number: string; quantity: string | number; unit: string; items: ItemRef; purchase_orders: { po_number: string } | null };
type ProductionHit = { id: string; batch_number: string; quantity: string | number; unit: string; items: ItemRef };
type FpHit = { id: string; batch_number: string; short_batch_no: string | null; target_qty: string | number; batch_yield: string | number | null; unit: string; mfr_definitions: { name: string } | null };

type Hit = { kind: TraceKind; id: string; batch: string; item: string; qty: string };

export default async function BatchTracePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; id?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const kind = KINDS.find((k) => k === sp.kind) ?? null;
  const id = sp.id && UUID.test(sp.id) ? sp.id : null;

  const supabase = await createClient();

  let hits: Hit[] = [];
  let searchError: string | null = null;
  if (q) {
    const like = `%${escapeLike(q)}%`;
    // The filter string of .or() uses commas and brackets as separators.
    const likeOr = `%${escapeLike(q.replace(/[,()]/g, " "))}%`;
    const [pl, pb, fp] = await Promise.all([
      supabase
        .from("purchase_lines")
        .select("id, batch_number, quantity, unit, items(item_code, name), purchase_orders(po_number)")
        .ilike("batch_number", like)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(25)
        .returns<PurchaseHit[]>(),
      supabase
        .from("production_issue_batches")
        .select("id, batch_number, quantity, unit, items(item_code, name)")
        .ilike("batch_number", like)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(25)
        .returns<ProductionHit[]>(),
      supabase
        .from("finished_product_batches")
        .select("id, batch_number, short_batch_no, target_qty, batch_yield, unit, mfr_definitions(name)")
        .or(`batch_number.ilike.${likeOr},short_batch_no.ilike.${likeOr}`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(25)
        .returns<FpHit[]>(),
    ]);
    searchError = pl.error?.message ?? pb.error?.message ?? fp.error?.message ?? null;
    hits = [
      ...(fp.data ?? []).map((r): Hit => ({
        kind: "fp",
        id: r.id,
        batch: fpBatchBoth(r.batch_number, r.short_batch_no),
        item: r.mfr_definitions?.name ?? "—",
        qty: `${formatQty(r.batch_yield ?? r.target_qty)} ${r.unit}`,
      })),
      ...(pl.data ?? []).map((r): Hit => ({
        kind: "purchase",
        id: r.id,
        batch: r.batch_number,
        item: r.items ? `${r.items.name} (${r.items.item_code})` : "—",
        qty: `${formatQty(r.quantity)} ${r.unit}${r.purchase_orders ? ` · ${r.purchase_orders.po_number}` : ""}`,
      })),
      ...(pb.data ?? []).map((r): Hit => ({
        kind: "production",
        id: r.id,
        batch: r.batch_number,
        item: r.items ? `${r.items.name} (${r.items.item_code})` : "—",
        qty: `${formatQty(r.quantity)} ${r.unit}`,
      })),
    ];
  }

  let rows: TraceRow[] = [];
  let traceError: string | null = null;
  if (kind && id) {
    const { data, error } = await supabase.rpc("trace_batch", { p_kind: kind, p_id: id });
    if (error) traceError = error.message;
    else rows = (data ?? []) as unknown as TraceRow[];
  }

  return (
    <div className="space-y-4">
      <Card>
        <form action="/inventory/batch-trace" className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Batch number" htmlFor="q">
            <Input id="q" name="q" defaultValue={q} placeholder="e.g. B1, PR-1 or a part of it" className="w-72" />
          </Field>
          <Button type="submit" variant="secondary" size="sm">
            Find batch
          </Button>
          <p className="basis-full text-xs text-muted">
            Works for raw and packing material batches, raw material made through production, and finished product batches (full or short number).
          </p>
        </form>

        {searchError && <p className="border-t border-border p-4 text-sm text-red">{searchError}</p>}
        {q && !searchError && (
          <div className="border-t border-border">
            {hits.length === 0 ? (
              <p className="p-4 text-sm text-muted">No batch matches “{q}”.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      <th className="px-4 py-2">Batch</th>
                      <th className="px-4 py-2">Type</th>
                      <th className="px-4 py-2">Item</th>
                      <th className="px-4 py-2">Quantity</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {hits.map((h) => (
                      <tr key={`${h.kind}-${h.id}`} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-4 py-2 font-medium">{h.batch}</td>
                        <td className="px-4 py-2 text-xs">{KIND_LABEL[h.kind]}</td>
                        <td className="px-4 py-2">{h.item}</td>
                        <td className="whitespace-nowrap px-4 py-2">{h.qty}</td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            href={`/inventory/batch-trace?kind=${h.kind}&id=${h.id}`}
                            className="text-sm font-medium text-brand-dark hover:underline"
                          >
                            Trace
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {traceError && (
        <Card>
          <p className="p-4 text-sm text-red">{traceError}</p>
        </Card>
      )}
      {kind && id && !traceError && rows.length === 0 && (
        <Card>
          <p className="p-4 text-sm text-muted">That batch was not found.</p>
        </Card>
      )}
      {rows.length > 0 && <TraceView rows={rows} />}
    </div>
  );
}

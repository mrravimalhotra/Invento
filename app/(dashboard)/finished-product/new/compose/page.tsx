import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ComposeForm, type ComposeLine } from "./compose-form";

type Candidate = {
  purchaseLineId: string;
  batchNumber: string;
  expiryDate: string | null;
  remainingQty: string | number;
};

// FIFO suggestion — DESIGN.md §7.3, implemented directly against the same views the
// design spec names (purchase_batch_status for QC status, stock_balance for on-hand),
// rather than PostgREST's automatic FK embedding (purchase_batch_status is a view with
// no declared FK for it to detect). Candidates are QC-Approved batches of this item with
// item-level stock still on hand, ordered by receipt date (oldest first) — the UI below
// pre-selects the first (FIFO) result but lets the user override.
//
// Ordering changed 3 Sept 2026 from "expiry date then receipt order" to receipt order
// alone: purchase_lines.expiry_date ("Re-Test Date" on the Purchase screen) is no longer
// collected at all (Ravi: the QC-computed quality_checks.retest_date, set automatically
// from Retest period + review date, is the one real retest mechanism — see
// lib/actions/purchase.ts) — every batch received going forward has expiry_date = null,
// and sorting nulls first would have inverted FIFO into "newest batch picked first."
// Receipt date is also the more literally correct FIFO key regardless (first *in*, not
// soonest to expire) — existing batches that do carry a historical expiry_date are
// unaffected by this change, they just no longer take priority over it.
async function getCandidateBatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string
): Promise<Candidate[]> {
  const { data: lines } = await supabase
    .from("purchase_lines")
    // live_remaining_qty (Phase 2, claude/inventory-ledger-redesign.md
    // Gap 2), not the static remaining_qty: this is the picker that
    // decides how much of a batch someone can consume for FP composition
    // — the exact gap this phase exists to close. The DB-level guard
    // (0029_purchase_line_live_remaining_qty.sql's live_remaining_not_negative
    // check) is the real enforcement; this keeps the picker's own "X
    // avail." hint from suggesting more than a batch actually has left.
    .select("id, batch_number, expiry_date, created_at, live_remaining_qty, unit")
    .eq("item_id", itemId)
    .eq("active", true);
  if (!lines || lines.length === 0) return [];

  const lineIds = lines.map((l) => l.id);
  const [{ data: statuses }, { data: balance }] = await Promise.all([
    supabase
      .from("purchase_batch_status")
      .select("purchase_line_id, qc_status, retest_date")
      .in("purchase_line_id", lineIds),
    supabase.from("stock_balance").select("on_hand").eq("item_id", itemId).maybeSingle(),
  ]);

  const onHand = Number(balance?.on_hand ?? 0);
  if (onHand <= 0) return [];

  const statusByLine = new Map((statuses ?? []).map((s) => [s.purchase_line_id, s]));

  // "Only QC Approved batches can be used for making finished product"
  // (3 Sept 2026) — a batch whose retest date has passed no longer counts
  // as usable, even though quality_checks.status is still 'approved'. This
  // mirrors check_batch_qc_approved() (0026_qc_retest_consumption_gate.sql),
  // which is the real, DB-level enforcement; filtering here is purely so
  // the picker never *offers* a batch that insert would reject anyway.
  const today = new Date().toISOString().slice(0, 10);
  return lines
    .filter((l) => {
      const status = statusByLine.get(l.id);
      if (status?.qc_status !== "approved") return false;
      if (status.retest_date && status.retest_date <= today) return false;
      // Phase 2: a batch already fully consumed (by earlier FP composition
      // and/or wastage) shouldn't be offered at all — the item still has
      // stock overall (the onHand <= 0 check above is item-level), just not
      // in THIS batch. The DB-level guard would reject picking it anyway;
      // this just keeps it out of the list in the first place.
      if (Number(l.live_remaining_qty) <= 0) return false;
      return true;
    })
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .map((l) => ({
      purchaseLineId: l.id,
      batchNumber: l.batch_number,
      expiryDate: l.expiry_date,
      remainingQty: l.live_remaining_qty,
    }));
}

export default async function ComposeFinishedProductPage({
  searchParams,
}: {
  searchParams: Promise<{
    mfr_definition_id?: string;
    mfr_version?: string;
    target_qty?: string;
    unit?: string;
    expiry_date?: string;
  }>;
}) {
  const sp = await searchParams;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!canWrite(user?.roles ?? [], "finished_product")) redirect("/finished-product");

  const mfrDefinitionId = sp.mfr_definition_id;
  const mfrVersion = Number(sp.mfr_version);
  const targetQty = Number(sp.target_qty);
  const unit = sp.unit ?? "";
  const expiryDate = sp.expiry_date ?? "";

  if (!mfrDefinitionId || !mfrVersion || !targetQty || !unit) {
    redirect("/finished-product/new");
  }

  const { data: def } = await supabase
    .from("mfr_definitions")
    .select("id, code, name, batch_size_qty, batch_size_unit")
    .eq("id", mfrDefinitionId)
    .maybeSingle();
  if (!def) redirect("/finished-product/new");

  const { data: mfrLines } = await supabase
    .from("mfr_lines")
    .select("id, quantity, unit, items(id, item_code, name)")
    .eq("mfr_definition_id", mfrDefinitionId)
    .eq("version", mfrVersion)
    .order("id");

  const batchSizeQty = Number(def!.batch_size_qty);
  const scaleFactor = batchSizeQty > 0 ? targetQty / batchSizeQty : 0;

  type MfrLineRow = { id: string; quantity: string | number; unit: string; items: { id: string; item_code: string; name: string } | null };
  const rows = (mfrLines ?? []) as unknown as MfrLineRow[];

  const composeLines: ComposeLine[] = await Promise.all(
    rows
      .filter((l) => l.items)
      .map(async (l) => {
        const item = l.items!;
        const scaledQuantity = Number(l.quantity) * scaleFactor;
        const candidates = await getCandidateBatches(supabase, item.id);
        return {
          itemId: item.id,
          itemLabel: `${item.item_code} · ${item.name}`,
          quantity: scaledQuantity,
          unit: l.unit,
          candidates,
        };
      })
  );

  return (
    <div>
      <PageHeader
        title="Calculate composition"
        description={`Step 2 of 2 — ${def!.code} · ${def!.name}, scaled to ${targetQty} ${unit}. Each ingredient defaults to its oldest received QC-Approved batch (FIFO); override any row before submitting.`}
      />
      <Card>
        <CardBody>
          {composeLines.length === 0 ? (
            <p className="text-sm text-muted">This MFR version has no recipe lines.</p>
          ) : (
            <ComposeForm
              mfrDefinitionId={mfrDefinitionId!}
              mfrVersion={mfrVersion}
              targetQty={targetQty}
              unit={unit}
              expiryDate={expiryDate}
              lines={composeLines}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

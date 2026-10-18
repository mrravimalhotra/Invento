import { round3 } from "@/lib/stock-precision";
import { allocateFifo, type Candidate } from "@/lib/fifo";
import { todayIst } from "@/lib/utils";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ComposeForm, type ComposeLine } from "./compose-form";
import { convertUnit } from "@/lib/constants/units";


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
//
// `expiry_date` itself is no longer fetched here at all (14 Sept 2026) — it was only
// ever used to render the "re-test <date>" suffix next to a batch's number, which Ravi
// asked to drop ("it should only show batch number, no need to show expiry/retest
// date") since it always shows blank for any batch received after the above 3 Sept
// change. Purely a display simplification; nothing in this function's actual filtering
// or sorting logic ever depended on this column.
async function getCandidateBatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string
): Promise<Candidate[]> {
  const [{ data: lines }, { data: productionBatches }] = await Promise.all([
    supabase
      .from("purchase_lines")
      // live_remaining_qty (Phase 2, claude/inventory-ledger-redesign.md
      // Gap 2), not the static remaining_qty: this is the picker that
      // decides how much of a batch someone can consume for FP composition
      // — the exact gap this phase exists to close. The DB-level guard
      // (0029_purchase_line_live_remaining_qty.sql's live_remaining_not_negative
      // check) is the real enforcement; this keeps the picker's own "X
      // avail." hint from suggesting more than a batch actually has left.
      .select("id, batch_number, is_legacy, created_at, live_remaining_qty, unit")
      .eq("item_id", itemId)
      .eq("active", true)
      // ACC-06 (29 Sept 2026): only batches whose purchase order is submitted
      // (in stock) — a reopened PO's batch keeps its QC approval but must not
      // be used until the PO is submitted again (the database refuses it too).
      .not("pushed_at", "is", null),
    // Production-sourced Raw Material batches (Ravi, 19 Sept 2026 —
    // "Packaging issued to Production"; supabase/migrations/
    // 0050_production_rm_from_packaging.sql). These never go through
    // Purchase/QC — the confirmed decision is that the original Finished
    // Product batch's own QC approval already cleared this material before
    // it could be converted, so unlike purchase_lines below there's no
    // QC-status/retest filtering to apply here; every active batch with
    // stock left is a valid candidate.
    supabase
      .from("production_issue_batches")
      .select("id, batch_number, created_at, live_remaining_qty, unit")
      .eq("item_id", itemId)
      .eq("active", true),
  ]);

  const hasCandidateRows = (lines?.length ?? 0) > 0 || (productionBatches?.length ?? 0) > 0;
  if (!hasCandidateRows) return [];

  const lineIds = (lines ?? []).map((l) => l.id);
  const productionIds = (productionBatches ?? []).map((b) => b.id);
  const [{ data: statuses }, { data: productionStatuses }, { data: balance }] = await Promise.all([
    lineIds.length
      ? supabase.from("purchase_batch_status").select("purchase_line_id, qc_status, retest_date, expiry_date").in("purchase_line_id", lineIds)
      : Promise.resolve({ data: [] }),
    // ACC-18 (29 Sept 2026): production-issued RM batches need QC approval
    // too since 0068 — the database refuses an unapproved one, but it used
    // to be offered here, so every Create Batch failed on it.
    productionIds.length
      ? supabase
          .from("production_batch_status")
          .select("production_batch_id, qc_status, retest_date, expiry_date")
          .in("production_batch_id", productionIds)
      : Promise.resolve({ data: [] }),
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
  //
  // Ravi re-asked for this exact guarantee on 14 Sept 2026 ("If any raw
  // material batch is due for re-test, it should not be available to
  // create new finished product until it is retested") — re-verified
  // locally against a fresh migration replay that both layers still hold:
  // a batch whose quality_checks.retest_date has passed is excluded here
  // (so it's never offered as a candidate to begin with, automatic FIFO
  // allocation included) AND, independently, a direct insert attempt
  // against such a batch is still rejected by the DB trigger regardless
  // of what this query returns. No code change was needed for this half
  // of the request — only the display cleanup above.
  const today = todayIst();
  type DatedCandidate = Candidate & { createdAt: string };
  const purchaseCandidates: DatedCandidate[] = (lines ?? [])
    .filter((l) => {
      const status = statusByLine.get(l.id);
      if (status?.qc_status !== "approved") return false;
      if (status.retest_date && status.retest_date <= today) return false;
      // FB-0058: a batch past its Expiry date is never offered.
      if (status.expiry_date && status.expiry_date < today) return false;
      // Phase 2: a batch already fully consumed (by earlier FP composition
      // and/or wastage) shouldn't be offered at all — the item still has
      // stock overall (the onHand <= 0 check above is item-level), just not
      // in THIS batch. The DB-level guard would reject picking it anyway;
      // this just keeps it out of the list in the first place.
      if (Number(l.live_remaining_qty) <= 0) return false;
      return true;
    })
    .map((l) => ({
      source: "purchase" as const,
      id: l.id,
      batchNumber: l.batch_number,
      remainingQty: l.live_remaining_qty,
      isLegacy: !!l.is_legacy,
      createdAt: l.created_at ?? "",
    }));

  const statusByProductionBatch = new Map(
    ((productionStatuses ?? []) as { production_batch_id: string; qc_status: string; retest_date: string | null; expiry_date: string | null }[]).map(
      (s) => [s.production_batch_id, s]
    )
  );
  const productionCandidates: DatedCandidate[] = (productionBatches ?? [])
    .filter((b) => {
      const status = statusByProductionBatch.get(b.id);
      if (status?.qc_status !== "approved") return false;
      if (status.retest_date && status.retest_date <= today) return false;
      if (status.expiry_date && status.expiry_date < today) return false;
      return Number(b.live_remaining_qty) > 0;
    })
    .map((b) => ({
      source: "production" as const,
      id: b.id,
      batchNumber: b.batch_number,
      remainingQty: b.live_remaining_qty,
      createdAt: b.created_at ?? "",
    }));

  // Merged, oldest-first across both sources — same FIFO ordering as
  // before, just drawing from two tables instead of one.
  return [...purchaseCandidates, ...productionCandidates]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(({ source, id, batchNumber, remainingQty, isLegacy }) => ({ source, id, batchNumber, remainingQty, isLegacy }));
}

export default async function ComposeFinishedProductPage({
  searchParams,
}: {
  searchParams: Promise<{
    mfr_definition_id?: string;
    mfr_version?: string;
    target_qty?: string;
    unit?: string;
    batch_start_date?: string;
  }>;
}) {
  const sp = await searchParams;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (!canWrite(user?.roles ?? [], "finished_product")) redirect("/finished-product");

  const mfrDefinitionId = sp.mfr_definition_id;
  const mfrVersion = Number(sp.mfr_version);
  const targetQty = Number(sp.target_qty);
  const unit = sp.unit ?? "";
  const batchStartDate = sp.batch_start_date ?? "";

  // SCAN-P5-07: a draft left for more than 30 minutes is cancelled lazily; do it
  // here too, before the batches are read, so its reserved raw material is offered.
  await supabase.rpc("expire_stale_fp_drafts");

  if (!mfrDefinitionId || !mfrVersion || !targetQty || !unit || !batchStartDate) {
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
  // ACC-04 (29 Sept 2026): the target can be entered in any unit that
  // converts to the MFR's batch-size unit (e.g. 50,000 g for a 100 kg MFR).
  // Scale in the batch-size unit — dividing 50,000 g by 100 kg used to scale
  // every ingredient ×500 instead of ×0.5. The batch itself is saved in the
  // batch-size unit too (0076_single_unit_per_item.sql).
  const targetInBatchUnit = convertUnit(targetQty, unit, def!.batch_size_unit);
  if (targetInBatchUnit === null) {
    return (
      <div>
        <PageHeader title="Calculate composition" />
        <Card>
          <CardBody className="text-sm text-red">
            {def!.code} is made in {def!.batch_size_unit}, so a target in {unit} can&apos;t be used. Go back and
            enter the target in {def!.batch_size_unit} (or a unit that converts to it).
          </CardBody>
        </Card>
      </div>
    );
  }
  const scaleFactor = batchSizeQty > 0 ? targetInBatchUnit / batchSizeQty : 0;

  type MfrLineRow = { id: string; quantity: string | number; unit: string; items: { id: string; item_code: string; name: string } | null };
  const rows = (mfrLines ?? []) as unknown as MfrLineRow[];

  const prepared = await Promise.all(
    rows
      .filter((l) => l.items)
      .map(async (l) => {
        const item = l.items!;
        const scaledQuantity = round3(Number(l.quantity) * scaleFactor);
        const candidates = await getCandidateBatches(supabase, item.id);
        return { l, item, scaledQuantity, candidates };
      })
  );
  // Allocate in recipe order, sharing one running tally per batch (ACC-30).
  const takenByBatch = new Map<string, number>();
  const composeLines: ComposeLine[] = prepared.map(({ l, item, scaledQuantity, candidates }) => {
    const { allocations, shortfallQty } = allocateFifo(candidates, scaledQuantity, takenByBatch);
    return {
      itemId: item.id,
      itemLabel: `${item.item_code} · ${item.name}`,
      quantity: scaledQuantity,
      unit: l.unit,
      allocations,
      shortfallQty,
    };
  });

  return (
    <div>
      <PageHeader
        title="Calculate composition"
        description={`Step 2 of 2 — ${def!.code} · ${def!.name}, scaled to ${targetInBatchUnit} ${def!.batch_size_unit}${unit !== def!.batch_size_unit ? ` (${targetQty} ${unit})` : ""}. Each ingredient is drawn automatically from its oldest received QC-Approved batches (FIFO), cascading into the next batch whenever one isn't enough on its own.`}
      />
      <Card>
        <CardBody>
          {composeLines.length === 0 ? (
            <p className="text-sm text-muted">This MFR version has no recipe lines.</p>
          ) : (
            <ComposeForm
              mfrDefinitionId={mfrDefinitionId!}
              mfrVersion={mfrVersion}
              targetQty={targetInBatchUnit}
              unit={def!.batch_size_unit}
              batchStartDate={batchStartDate}
              lines={composeLines}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { escapeLike, toIstDateString, todayIst } from "@/lib/utils";
import { rmEligibleFor, type LabelKind } from "@/app/(dashboard)/labels/label-eligibility";
import { LABEL_RESULT_LIMIT, type FpRecord, type RmRecord } from "@/app/(dashboard)/labels/label-types";

// SCAN-P4-16 (Ravi, 12 Oct 2026): the Label Printing page used to read every
// raw material purchase line and every finished product batch into the browser.
// It now asks the server for the batches that match what was typed and are
// eligible for the chosen label, newest first, at most LABEL_RESULT_LIMIT.

const PAGE = 200; // purchase lines examined per round trip
const MAX_ROUNDS = 5; // at most 1,000 lines examined for one search

export type LabelSearchResult = {
  rm: RmRecord[];
  fp: FpRecord[];
  // true when more matches exist than are listed
  more: boolean;
  error?: string;
};

type PurchaseLineFetch = {
  id: string;
  batch_number: string;
  is_legacy: boolean;
  created_at: string;
  pushed_at: string | null;
  quantity: string | number;
  unit: string;
  item: { name: string } | null;
  purchase_order: {
    invoice_number: string;
    invoice_date: string;
    received_on: string | null;
    submitted_at: string | null;
    vendor: { name: string } | null;
  } | null;
};

type BatchStatusFetch = {
  purchase_line_id: string;
  qc_status: string;
  ar_number: string | null;
  retest_date: string | null;
  expiry_date: string | null;
  quality_check_id: string | null;
};

type FpBatchFetch = {
  id: string;
  batch_number: string;
  short_batch_no: string | null;
  is_legacy: boolean;
  batch_yield: string | number | null;
  unit: string;
  finish_date: string | null;
  expiry_month: string | null;
  status: string;
  mfr_definition: { name: string } | null;
};

// The text goes into a PostgREST `or(...)` expression, where commas, brackets
// and quotes have a meaning of their own; drop them (batch numbers and item
// names do not need them), then escape the LIKE wildcards.
function cleanTerm(raw: string): string {
  return escapeLike(raw.replace(/[,()"\\*]/g, " ").replace(/\s+/g, " ").trim());
}

export async function searchLabelBatches(kind: LabelKind, rawQuery: string): Promise<LabelSearchResult> {
  const empty: LabelSearchResult = { rm: [], fp: [], more: false };
  const user = await getCurrentUser();
  if (!user) return { ...empty, error: "Your session has ended. Sign in again." };

  const supabase = await createClient();
  const term = cleanTerm(String(rawQuery ?? "").slice(0, 80));
  return kind === "finished_product"
    ? searchFp(supabase, term)
    : searchRm(supabase, kind, term);
}

type Db = Awaited<ReturnType<typeof createClient>>;

async function searchFp(supabase: Db, term: string): Promise<LabelSearchResult> {
  let q = supabase
    .from("finished_product_batches")
    .select(
      "id, batch_number, short_batch_no, is_legacy, batch_yield, unit, finish_date, expiry_month, status, mfr_definition:mfr_definitions(name)"
    )
    .eq("active", true)
    .eq("status", "approved");

  if (term) {
    const { data: defs } = await supabase
      .from("mfr_definitions")
      .select("id")
      .ilike("name", `%${term}%`)
      .order("id")
      .limit(200);
    const ids = (defs ?? []).map((d: { id: string }) => d.id);
    const parts = [`batch_number.ilike.%${term}%`, `short_batch_no.ilike.%${term}%`];
    if (ids.length > 0) parts.push(`mfr_definition_id.in.(${ids.join(",")})`);
    q = q.or(parts.join(","));
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(LABEL_RESULT_LIMIT + 1)
    .returns<unknown[]>();
  if (error) {
    console.error("[labels] fp search", error.message);
    return { rm: [], fp: [], more: false, error: "The batches could not be loaded. Try again." };
  }
  const all = (data ?? []) as unknown as FpBatchFetch[];
  const shown = all.slice(0, LABEL_RESULT_LIMIT);

  // SCAN-P4-04 (12 Oct 2026): a batch that has expired, is past its retest date or has a
  // retest in progress is not labelled until it is retested and approved again.
  const { data: blocked } = shown.length
    ? await supabase.rpc("fp_batch_block_reasons", { p_ids: shown.map((b) => b.id) })
    : { data: [] as { batch_id: string }[] };
  const blockedIds = new Set(((blocked ?? []) as { batch_id: string }[]).map((r) => r.batch_id));
  const batches = shown.filter((b) => !blockedIds.has(b.id));

  // FB-0058: the Best Before date is the Expiry date the QC Reviewer set when approving the batch.
  const { data: qcExpiry } = await fetchByIdChunks<{ finished_product_batch_id: string; expiry_date: string | null }>(
    batches.map((b) => b.id),
    (chunk) =>
      supabase
        .from("quality_checks")
        .select("finished_product_batch_id, expiry_date")
        .eq("status", "approved")
        .not("expiry_date", "is", null)
        .in("finished_product_batch_id", chunk)
        // a retested batch has several approvals: the newest one's expiry wins in the map below
        .order("created_at", { ascending: true })
  );
  const expiryById = new Map(qcExpiry.map((x) => [x.finished_product_batch_id, x.expiry_date]));

  const fp: FpRecord[] = batches.map((b) => ({
    id: b.id,
    productName: b.mfr_definition?.name ?? "—",
    batchNumber: b.batch_number,
    shortBatchNumber: b.short_batch_no,
    isLegacy: b.is_legacy,
    quantity: b.batch_yield !== null ? Number(b.batch_yield) : null,
    unit: b.unit,
    finishDate: b.finish_date,
    expiryMonth: b.expiry_month,
    qcExpiryDate: expiryById.get(b.id) ?? null,
    status: b.status,
  }));
  return { rm: [], fp, more: all.length > LABEL_RESULT_LIMIT };
}

async function searchRm(supabase: Db, kind: LabelKind, term: string): Promise<LabelSearchResult> {
  // Raw material only: the three purchase-line templates are raw-material labels.
  let itemIds: string[] = [];
  if (term) {
    const { data: items } = await supabase
      .from("items")
      .select("id")
      .eq("category", "raw")
      .ilike("name", `%${term}%`)
      .order("id")
      .limit(300);
    itemIds = (items ?? []).map((i: { id: string }) => i.id);
  }

  const today = todayIst();
  const found: RmRecord[] = [];
  let more = false;
  let reachedEnd = false;

  for (let round = 0; round < MAX_ROUNDS && found.length <= LABEL_RESULT_LIMIT && !reachedEnd; round++) {
    let q = supabase
      .from("purchase_lines")
      .select(
        "id, batch_number, is_legacy, created_at, pushed_at, quantity, unit, item:items!inner(name, category), purchase_order:purchase_orders(invoice_number, invoice_date, received_on, submitted_at, vendor:vendors(name))"
      )
      .eq("active", true)
      .eq("items.category", "raw");
    if (term) {
      const parts = [`batch_number.ilike.%${term}%`];
      if (itemIds.length > 0) parts.push(`item_id.in.(${itemIds.join(",")})`);
      q = q.or(parts.join(","));
    }
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(round * PAGE, round * PAGE + PAGE - 1)
      .returns<unknown[]>();
    if (error) {
      console.error("[labels] rm search", error.message);
      return { rm: [], fp: [], more: false, error: "The batches could not be loaded. Try again." };
    }
    const lines = (data ?? []) as unknown as PurchaseLineFetch[];
    if (lines.length < PAGE) reachedEnd = true;
    if (lines.length === 0) break;

    const { data: statuses } = await fetchByIdChunks<BatchStatusFetch>(
      lines.map((l) => l.id),
      (chunk) =>
        supabase
          .from("purchase_batch_status")
          .select("purchase_line_id, qc_status, ar_number, retest_date, expiry_date, quality_check_id")
          .in("purchase_line_id", chunk)
    );
    const statusByLine = new Map(statuses.map((s) => [s.purchase_line_id, s]));

    const eligible = lines.filter((l) => {
      const s = statusByLine.get(l.id);
      return rmEligibleFor(
        kind,
        {
          qcStatus: s?.qc_status ?? "not_submitted",
          retestDate: s?.retest_date ?? null,
          expiryDate: s?.expiry_date ?? null,
          poSubmitted: l.pushed_at !== null,
        },
        today
      );
    });

    const qcIds = eligible
      .map((l) => statusByLine.get(l.id)?.quality_check_id)
      .filter((id): id is string => !!id);
    const { data: qcRows } = await fetchByIdChunks<{ id: string; retest_period_days: number | null }>(
      qcIds,
      (chunk) => supabase.from("quality_checks").select("id, retest_period_days").in("id", chunk)
    );
    const retestByQc = new Map(qcRows.map((q2) => [q2.id, q2.retest_period_days]));

    for (const l of eligible) {
      const s = statusByLine.get(l.id);
      const po = l.purchase_order;
      found.push({
        id: l.id,
        itemName: l.item?.name ?? "—",
        batchNumber: l.batch_number,
        isLegacy: l.is_legacy,
        quantity: Number(l.quantity),
        unit: l.unit,
        vendorName: po?.vendor?.name ?? "—",
        invoiceNumber: po?.invoice_number ?? "—",
        // Opening stock: the real receipt date is the line's date, not the load day.
        // B13: the typed "Received on" date; older / bulk-uploaded POs fall back to the submit day, then the invoice date.
        receiptDate: l.is_legacy
          ? toIstDateString(l.created_at)
          : po?.received_on ?? (po?.submitted_at ? toIstDateString(po.submitted_at) : po?.invoice_date ?? null),
        qcStatus: s?.qc_status ?? "not_submitted",
        arNumber: s?.ar_number ?? null,
        retestDate: s?.retest_date ?? null,
        expiryDate: s?.expiry_date ?? null,
        poSubmitted: l.pushed_at !== null,
        retestPeriodDays: s?.quality_check_id ? retestByQc.get(s.quality_check_id) ?? null : null,
      });
    }
  }

  if (found.length > LABEL_RESULT_LIMIT) more = true;
  else if (!reachedEnd) more = true; // stopped at the examined-lines cap
  return { rm: found.slice(0, LABEL_RESULT_LIMIT), fp: [], more };
}

"use server";

// Opening stock (Ravi, 3 Oct 2026, FB-0054 / B4): load the stock on hand from
// the old records before go-live. Every role may load; the System Administrator
// closes loading by hand after the agreed cut-off, can re-open it, and can undo
// a load while loading is open and nothing from it has been used.
// All-or-nothing: the file is checked first and loaded only if every row passes.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/db-errors";
import { todayIst } from "@/lib/utils";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { readFirstSheet, findColumnIndex, type ParsedSheet } from "@/lib/bulk-upload/parse";
import { MAX_OPENING_ROWS, OPENING_COLUMNS, OPENING_EXAMPLES, OPENING_KINDS, type OpeningKind } from "@/lib/opening-stock/columns";
import { validateOpeningSheet, type OpeningItem } from "@/lib/opening-stock/validate";

export type OpeningUploadState =
  | {
      error?: string;
      rowErrors?: string[];
      // set by "Check file" when every row passed
      checked?: {
        kind: OpeningKind; rows: number; approved: number; pending: number; rejected: number;
        // SCAN-P2-10: per item, what this file will load (raw material and packaging)
        summary: { code: string; name: string; unit: string; batches: number; total: number }[];
      };
      success?: string;
    }
  | undefined;

export type OpeningSimpleState = { error?: string; success?: string } | undefined;

type Supa = Awaited<ReturnType<typeof createClient>>;

// Who may load, which kind, and whether loading is still open. Shared by the Excel
// route and the typed-in route.
async function openingGate(rawKind: string): Promise<{ error: string } | { kind: OpeningKind; supabase: Supa }> {
  const user = await getCurrentUser();
  if (!user || user.roles.length === 0) return { error: "Not authorized." };
  const kind = rawKind as OpeningKind;
  if (!OPENING_KINDS.some((k) => k.key === kind)) return { error: "Unknown opening stock type." };
  const supabase = await createClient();
  const { data: settings } = await supabase.from("opening_stock_settings").select("is_open").maybeSingle();
  if (!settings?.is_open) return { error: "Opening stock loading is closed." };
  return { kind, supabase };
}

export async function submitOpeningStock(_prev: OpeningUploadState, formData: FormData): Promise<OpeningUploadState> {
  const gate = await openingGate(String(formData.get("kind") ?? ""));
  if ("error" in gate) return { error: gate.error };
  const { kind, supabase } = gate;
  const meta = OPENING_KINDS.find((k) => k.key === kind)!;
  const intent = formData.get("intent") === "load" ? "load" : "check";

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel file (.xlsx) first." };

  const columns = OPENING_COLUMNS[kind];
  let sheet;
  try {
    sheet = await readFirstSheet(file, meta.sheetName, { skipExamples: { columns, rows: OPENING_EXAMPLES[kind] } });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that file." };
  }
  return runOpening(supabase, kind, intent, sheet, "file");
}

// Typed-in route (Ravi, 12 Oct 2026): the rows typed on the page go through exactly the same
// checks and the same database function as an Excel file. The page sends one string per
// column, in the order of OPENING_COLUMNS; "Row N" in a message is the row's number on the page.
export async function submitOpeningRows(_prev: OpeningUploadState, formData: FormData): Promise<OpeningUploadState> {
  const gate = await openingGate(String(formData.get("kind") ?? ""));
  if ("error" in gate) return { error: gate.error };
  const { kind, supabase } = gate;
  const intent = formData.get("intent") === "load" ? "load" : "check";
  const columns = OPENING_COLUMNS[kind];

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("rows") ?? ""));
  } catch {
    return { error: "Couldn't read the rows. Please try again." };
  }
  if (!Array.isArray(parsed)) return { error: "Couldn't read the rows. Please try again." };
  if (parsed.length > MAX_OPENING_ROWS * 2) {
    return { error: `Too many rows — the limit per load is ${MAX_OPENING_ROWS}.` };
  }
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const r = parsed[i];
    if (!Array.isArray(r) || r.length !== columns.length || r.some((c) => typeof c !== "string")) {
      return { error: "Couldn't read the rows. Please reload the page and try again." };
    }
    const cells = (r as string[]).map((c) => c.trim());
    if (cells.every((c) => c === "")) continue; // a row left empty is not a row
    rows.push(cells);
    rowNumbers.push(i + 1);
  }
  const sheet = { headers: columns.map((c) => c.header), rows, rowNumbers };
  return runOpening(supabase, kind, intent, sheet, "rows");
}

// What the typed-in form offers in its pick lists: the active items of the right kind (with
// their unit) and the active vendors. Read-only; loaded when the person opens "Type it in".
export type OpeningChoices =
  | { error: string }
  | {
      items: { code: string; name: string; unit: string; hasPackaged: boolean }[];
      vendors: { code: string; name: string }[];
    };

export async function loadOpeningChoices(rawKind: string): Promise<OpeningChoices> {
  const user = await getCurrentUser();
  if (!user || user.roles.length === 0) return { error: "Not authorized." };
  const kind = rawKind as OpeningKind;
  if (!OPENING_KINDS.some((k) => k.key === kind)) return { error: "Unknown opening stock type." };
  const supabase = await createClient();
  const category = kind === "raw" ? "raw" : kind === "packaging" ? "packaging" : "processed";
  const [itemsRes, vendorsRes, mfrRes] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("items").select("id, item_code, name, unit, packaged_item_id").eq("active", true).eq("category", category)
        .order("item_code", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    kind === "finished"
      ? Promise.resolve({ data: [] as { vendor_code: string; name: string }[], error: null })
      : fetchAllRows((from, to) =>
          supabase.from("vendors").select("vendor_code, name").eq("active", true).neq("vendor_code", "V-OPENING")
            .order("vendor_code", { ascending: true }).order("id", { ascending: true }).range(from, to)),
    kind === "finished"
      ? fetchAllRows((from, to) =>
          supabase.from("mfr_definitions").select("finished_product_item_id")
            .not("finished_product_item_id", "is", null).order("id", { ascending: true }).range(from, to))
      : Promise.resolve({ data: [] as { finished_product_item_id: string }[], error: null }),
  ]);
  if (itemsRes.error || vendorsRes.error || mfrRes.error) return { error: "Could not read Item Master / Vendor Master. Please try again." };
  const mfrItems = new Set((mfrRes.data ?? []).map((m) => m.finished_product_item_id as string));
  return {
    items: (itemsRes.data ?? [])
      .filter((i) => kind !== "finished" || mfrItems.has(i.id as string))
      .map((i) => ({ code: i.item_code as string, name: i.name as string, unit: i.unit as string, hasPackaged: !!i.packaged_item_id })),
    vendors: (vendorsRes.data ?? []).map((v) => ({ code: v.vendor_code as string, name: v.name as string })),
  };
}

async function runOpening(
  supabase: Supa, kind: OpeningKind, intent: "check" | "load", sheet: ParsedSheet, source: "file" | "rows",
): Promise<OpeningUploadState> {
  const columns = OPENING_COLUMNS[kind];
  const missing = columns.filter((c) => c.required && findColumnIndex(sheet.headers, c) === -1);
  if (missing.length > 0) {
    return { error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.map((c) => `"${c.header}"`).join(", ")} — did you use the downloaded template?` };
  }
  if (sheet.rows.length === 0) {
    return { error: source === "file" ? "That file has no data rows — nothing to load." : "Fill in at least one row — nothing to load." };
  }
  if (sheet.rows.length > MAX_OPENING_ROWS) {
    return {
      error: source === "file"
        ? `That file has ${sheet.rows.length} rows — the limit per file is ${MAX_OPENING_ROWS}. Split it into smaller files.`
        : `There are ${sheet.rows.length} rows — the limit per load is ${MAX_OPENING_ROWS}. Load them in smaller groups.`,
    };
  }

  const category = kind === "raw" ? "raw" : kind === "packaging" ? "packaging" : "processed";
  const [itemsRes, vendorsRes] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("items").select("id, item_code, name, category, unit, packaged_item_id").eq("active", true)
        .order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) =>
      supabase.from("vendors").select("id, vendor_code").eq("active", true)
        .order("id", { ascending: true }).range(from, to)),
  ]);
  if (itemsRes.error || vendorsRes.error) return { error: "Could not read Item Master / Vendor Master. Please try again." };
  const items = (itemsRes.data ?? []) as OpeningItem[];
  const itemsByCode = new Map(items.map((i) => [i.item_code.toLowerCase(), i]));
  const vendorIdByCode = new Map((vendorsRes.data ?? []).map((v) => [v.vendor_code.toLowerCase(), v.id as string]));

  // Existing batches (raw material and packaging: per item; finished product: batch numbers are unique overall)
  // and every used AR number.
  let existingBatches = new Set<string>();
  let existingFpBatches: Set<string> | undefined;
  let fpItemIds: Set<string> | undefined;
  let batchError = false;
  if (kind === "finished") {
    const [mfrRes, fpBatchRes] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase.from("mfr_definitions").select("finished_product_item_id")
          .not("finished_product_item_id", "is", null).order("id", { ascending: true }).range(from, to)),
      fetchAllRows((from, to) =>
        supabase.from("finished_product_batches").select("batch_number").order("id", { ascending: true }).range(from, to)),
    ]);
    batchError = !!(mfrRes.error || fpBatchRes.error);
    fpItemIds = new Set((mfrRes.data ?? []).map((m) => m.finished_product_item_id as string));
    existingFpBatches = new Set((fpBatchRes.data ?? []).map((b) => b.batch_number as string));
  } else {
    const fileItemIds = items.filter((i) => i.category === category).map((i) => i.id);
    const batchRes = await fetchByIdChunks(fileItemIds, (chunk) =>
      supabase.from("purchase_lines").select("item_id, batch_number").in("item_id", chunk).limit(5000));
    batchError = !!batchRes.error;
    existingBatches = new Set(batchRes.data.map((b) => `${b.item_id}|${b.batch_number}`));
  }
  const arRes = await fetchAllRows((from, to) =>
    supabase.from("quality_checks").select("ar_number").order("id", { ascending: true }).range(from, to));
  if (batchError || arRes.error) return { error: "Could not read existing batches. Please try again." };
  const existingArs = new Set((arRes.data ?? []).map((q) => q.ar_number as string));

  const result = validateOpeningSheet(kind, sheet, {
    today: todayIst(), itemsByCode, vendorIdByCode, existingBatches, existingArs, fpItemIds, existingFpBatches,
  });
  if (result.errors.length > 0) {
    return {
      error: `${result.errors.length} problem${result.errors.length === 1 ? "" : "s"} found. Nothing was loaded. ${source === "file" ? "Fix the file and check it again." : "Fix the rows and check them again."}`,
      rowErrors: result.errors.slice(0, 200),
    };
  }

  if (intent === "check") {
    return { checked: { kind, rows: result.rows.length, ...result.counts, summary: result.summary } };
  }

  const { data, error } =
    kind === "finished"
      ? await supabase.rpc("load_opening_finished_product", { p_rows: result.rows })
      : await supabase.rpc("load_opening_stock", { p_kind: kind, p_rows: result.rows });
  if (error) return { error: friendlyDbError(error, "Could not load the opening stock.") };
  const loadNo = (data as { load_no: string }[] | null)?.[0]?.load_no ?? "";
  revalidatePath("/opening-stock");
  revalidatePath("/inventory");
  revalidatePath("/qc");
  return { success: `Loaded ${result.rows.length} row${result.rows.length === 1 ? "" : "s"} as ${loadNo}.` };
}

export async function setOpeningStockOpen(_prev: OpeningSimpleState, formData: FormData): Promise<OpeningSimpleState> {
  const user = await getCurrentUser();
  if (!user?.roles.includes("system_admin")) return { error: "Only the System Administrator can do this." };
  const open = formData.get("open") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_opening_stock_open", { p_open: open });
  if (error) return { error: friendlyDbError(error, "Could not change the opening stock setting.") };
  revalidatePath("/opening-stock");
  return { success: open ? "Opening stock loading is open again." : "Opening stock loading is closed." };
}

export async function undoOpeningLoad(_prev: OpeningSimpleState, formData: FormData): Promise<OpeningSimpleState> {
  const user = await getCurrentUser();
  if (!user?.roles.includes("system_admin")) return { error: "Only the System Administrator can undo a load." };
  const id = String(formData.get("load_id") ?? "");
  if (!id) return { error: "Load not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_opening_load", { p_load_id: id });
  if (error) return { error: friendlyDbError(error, "Could not undo the load.") };
  revalidatePath("/opening-stock");
  revalidatePath("/inventory");
  revalidatePath("/qc");
  return { success: "Load undone. Its stock and records were removed." };
}

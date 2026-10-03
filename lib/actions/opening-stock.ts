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
import { readFirstSheet, findColumnIndex } from "@/lib/bulk-upload/parse";
import { MAX_OPENING_ROWS, OPENING_COLUMNS, OPENING_EXAMPLES, OPENING_KINDS, type OpeningKind } from "@/lib/opening-stock/columns";
import { validateOpeningSheet, type OpeningItem } from "@/lib/opening-stock/validate";

export type OpeningUploadState =
  | {
      error?: string;
      rowErrors?: string[];
      // set by "Check file" when every row passed
      checked?: { kind: OpeningKind; rows: number; approved: number; pending: number; rejected: number };
      success?: string;
    }
  | undefined;

export type OpeningSimpleState = { error?: string; success?: string } | undefined;

export async function submitOpeningStock(_prev: OpeningUploadState, formData: FormData): Promise<OpeningUploadState> {
  const user = await getCurrentUser();
  if (!user || user.roles.length === 0) return { error: "Not authorized." };

  const kind = String(formData.get("kind") ?? "") as OpeningKind;
  const meta = OPENING_KINDS.find((k) => k.key === kind);
  if (!meta) return { error: "Unknown opening stock type." };
  const intent = formData.get("intent") === "load" ? "load" : "check";

  const supabase = await createClient();
  const { data: settings } = await supabase.from("opening_stock_settings").select("is_open").maybeSingle();
  if (!settings?.is_open) return { error: "Opening stock loading is closed." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an Excel file (.xlsx) first." };

  const columns = OPENING_COLUMNS[kind];
  let sheet;
  try {
    sheet = await readFirstSheet(file, meta.sheetName, { skipExamples: { columns, rows: OPENING_EXAMPLES[kind] } });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that file." };
  }
  const missing = columns.filter((c) => c.required && findColumnIndex(sheet.headers, c) === -1);
  if (missing.length > 0) {
    return { error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.map((c) => `"${c.header}"`).join(", ")} — did you use the downloaded template?` };
  }
  if (sheet.rows.length === 0) return { error: "That file has no data rows — nothing to load." };
  if (sheet.rows.length > MAX_OPENING_ROWS) {
    return { error: `That file has ${sheet.rows.length} rows — the limit per file is ${MAX_OPENING_ROWS}. Split it into smaller files.` };
  }

  const category = kind === "raw" ? "raw" : "packaging";
  const [itemsRes, vendorsRes] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from("items").select("id, item_code, category, unit").eq("active", true)
        .order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) =>
      supabase.from("vendors").select("id, vendor_code").eq("active", true)
        .order("id", { ascending: true }).range(from, to)),
  ]);
  if (itemsRes.error || vendorsRes.error) return { error: "Could not read Item Master / Vendor Master. Please try again." };
  const items = (itemsRes.data ?? []) as OpeningItem[];
  const itemsByCode = new Map(items.map((i) => [i.item_code.toLowerCase(), i]));
  const vendorIdByCode = new Map((vendorsRes.data ?? []).map((v) => [v.vendor_code.toLowerCase(), v.id as string]));

  // Existing batches of the items in the file, and every used AR number.
  const fileItemIds = items.filter((i) => i.category === category).map((i) => i.id);
  const [batchRes, arRes] = await Promise.all([
    fetchByIdChunks(fileItemIds, (chunk) =>
      supabase.from("purchase_lines").select("item_id, batch_number").in("item_id", chunk).limit(5000)),
    fetchAllRows((from, to) =>
      supabase.from("quality_checks").select("ar_number").order("id", { ascending: true }).range(from, to)),
  ]);
  if (batchRes.error || arRes.error) return { error: "Could not read existing batches. Please try again." };
  const existingBatches = new Set(batchRes.data.map((b) => `${b.item_id}|${b.batch_number}`));
  const existingArs = new Set((arRes.data ?? []).map((q) => q.ar_number as string));

  const result = validateOpeningSheet(kind, sheet, {
    today: todayIst(), itemsByCode, vendorIdByCode, existingBatches, existingArs,
  });
  if (result.errors.length > 0) {
    return {
      error: `${result.errors.length} problem${result.errors.length === 1 ? "" : "s"} found. Nothing was loaded. Fix the file and check it again.`,
      rowErrors: result.errors.slice(0, 200),
    };
  }

  if (intent === "check") {
    return { checked: { kind, rows: result.rows.length, ...result.counts } };
  }

  const { data, error } = await supabase.rpc("load_opening_stock", { p_kind: kind, p_rows: result.rows });
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

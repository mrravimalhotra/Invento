"use server";

// Admin "Purge Test Data" action — see
// supabase/migrations/0039_purge_test_data.sql for the full scoping
// writeup and exactly what is/isn't wiped. Ravi (13 Sept 2026): "Create
// an admin controlled button to Purge all inventory/purchase related
// data except authentication and similar records so i can do testing
// from scratch without any historical records."

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
// The literal confirm phrase lives in lib/constants/admin.ts, not here —
// a "use server" file in this Next.js version may only export async
// functions; a plain const export alongside them breaks the whole
// module (confirmed via next build, see that file's comment). The
// server side still independently re-checks it below, so the client
// never trusts its own gating alone, matching this app's usual
// defense-in-depth convention. purge_test_data() itself re-checks
// system_admin server-side regardless of what this action does.
import { PURGE_CONFIRM_PHRASE } from "@/lib/constants/admin";

export type PurgeResult =
  | { error: string; summary?: undefined }
  | { error?: undefined; summary: { table: string; rows: number }[] }
  | undefined;

export async function purgeTestData(_prev: PurgeResult, formData: FormData): Promise<PurgeResult> {
  const user = await getCurrentUser();
  if (!user?.roles?.includes("system_admin")) {
    return { error: "Only System Admin can purge test data." };
  }

  const confirmText = String(formData.get("confirm_text") || "");
  if (confirmText !== PURGE_CONFIRM_PHRASE) {
    return { error: `Type "${PURGE_CONFIRM_PHRASE}" exactly to confirm.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purge_test_data");
  if (error) return { error: error.message };

  const summary = ((data ?? []) as { table_name: string; rows_purged: number }[]).map((r) => ({
    table: r.table_name,
    rows: r.rows_purged,
  }));

  // Every page in the app already reads live data on every request, so
  // nothing needs revalidating for correctness — this just clears any
  // cached shared chrome (e.g. dashboard stat cards) that might
  // otherwise keep showing pre-purge numbers, same convention as
  // setUserRoles()'s layout-level revalidate (Eighteenth pass).
  revalidatePath("/", "layout");

  return { summary };
}

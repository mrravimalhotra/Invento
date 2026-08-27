/**
 * One-time bootstrap: grants system_admin to an existing Supabase Auth user
 * by email. The User Roles & Access screen itself is system_admin-only
 * (docs/DESIGN.md §3), so the very first admin has to be granted outside
 * the app — this script is that one exception, and it requires the
 * service-role key (never used anywhere else in this codebase) precisely
 * because it must bypass RLS.
 *
 * Usage:
 *   1. Sign up normally at /register with the account that should become
 *      the first admin.
 *   2. SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *        npx tsx scripts/seed-admin.ts you@example.com
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/seed-admin.ts <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No auth user found for ${email} — register the account first, then re-run this script.`);
    process.exit(1);
  }

  const { error: insertError } = await admin
    .from("user_roles")
    .upsert({ user_id: user.id, role: "system_admin" }, { onConflict: "user_id,role" });
  if (insertError) throw insertError;

  console.log(`Granted system_admin to ${email} (${user.id}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import type { createClient } from "@/lib/supabase/server";
import { DEFAULT_COMPANY, type Company } from "@/lib/company";

// Reads the saved company details (company_settings, one row). Falls back to
// the defaults if the row cannot be read, so a page or document never fails
// because of its letterhead.
export async function fetchCompany(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Company> {
  const { data } = await supabase
    .from("company_settings")
    .select("company_name, address, licence_label, licence_no")
    .maybeSingle<{ company_name: string; address: string; licence_label: string; licence_no: string }>();
  if (!data) return DEFAULT_COMPANY;
  return {
    name: data.company_name,
    address: data.address,
    licenceLabel: data.licence_label,
    licenceNo: data.licence_no,
  };
}

// Automatic sign-out after inactivity (SCAN-P1-02, migration 0113): minutes, 0 = switched off.
// Default 60 if the row cannot be read. Never applied to a System Admin (see IdleSignOut).
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 60;
export async function fetchIdleTimeoutMinutes(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data } = await supabase
    .from("company_settings")
    .select("idle_timeout_minutes")
    .maybeSingle<{ idle_timeout_minutes: number | null }>();
  const m = data?.idle_timeout_minutes;
  return typeof m === "number" ? m : DEFAULT_IDLE_TIMEOUT_MINUTES;
}

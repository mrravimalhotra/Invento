export const ROLES = [
  "inventory_manager",
  "system_admin",
  "super_auditor",
  "quality_checker",
  "qc_reviewer",
  "mfr_manager",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  inventory_manager: "Inventory Manager",
  system_admin: "System Admin",
  super_auditor: "Super Auditor",
  quality_checker: "Quality Checker",
  qc_reviewer: "QC Reviewer",
  mfr_manager: "MFR Manager",
};

// Mirrors the RLS write policies in supabase/migrations/0001_init.sql.
// Used only to hide/show UI affordances (the "New" button, nav items) —
// the database is the real enforcement; this is never the only check.
export const MODULE_WRITE_ROLES = {
  item_types: ["system_admin", "inventory_manager", "mfr_manager"],
  items: ["system_admin", "inventory_manager", "mfr_manager"],
  vendors: ["system_admin", "inventory_manager"],
  purchase: ["system_admin", "inventory_manager"],
  qc_assign: ["system_admin", "inventory_manager", "quality_checker", "qc_reviewer"],
  qc_review: ["system_admin", "quality_checker", "qc_reviewer"],
  // Mirrors record_wastage()'s own has_any_role check in 0002_transactions.sql —
  // the only write this module owns (everything else in inventory_ledger is
  // written by triggers, not by this module's UI).
  inventory: ["system_admin", "inventory_manager", "quality_checker", "qc_reviewer"],
  mfr: ["system_admin", "mfr_manager"],
  finished_product: ["system_admin", "mfr_manager", "inventory_manager"],
  bmr: ["system_admin", "mfr_manager", "quality_checker", "qc_reviewer"],
  packaging: ["system_admin", "inventory_manager", "mfr_manager"],
  coa: ["system_admin", "quality_checker", "qc_reviewer"],
  line_clearance: ["system_admin", "quality_checker", "qc_reviewer", "mfr_manager"],
  environmental_control: ["system_admin", "quality_checker", "qc_reviewer", "mfr_manager"],
  user_roles: ["system_admin"],
  documents: ["system_admin", "quality_checker", "qc_reviewer"],
} as const satisfies Record<string, readonly Role[]>;

export function canWrite(userRoles: string[], module: keyof typeof MODULE_WRITE_ROLES) {
  const allowed: readonly string[] = MODULE_WRITE_ROLES[module];
  return userRoles.some((r) => allowed.includes(r));
}

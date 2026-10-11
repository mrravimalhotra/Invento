import Link from "next/link";
import { History } from "lucide-react";
import { canReadAudit } from "@/lib/constants/roles";
import type { Role } from "@/lib/constants/roles";

// SCAN-P1-15: "who changed this record?" in one click. Shown only to the roles that can open the
// Audit Log (System Admin, Super Auditor); it opens the log filtered to this one record.
export function AuditHistoryLink({ recordId, roles }: { recordId: string; roles: readonly Role[] }) {
  if (!canReadAudit([...roles])) return null;
  return (
    <Link
      href={`/audit?record=${encodeURIComponent(recordId)}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-sm text-foreground hover:bg-black/5 max-md:min-h-10"
    >
      <History className="h-3.5 w-3.5" aria-hidden="true" />
      History
    </Link>
  );
}

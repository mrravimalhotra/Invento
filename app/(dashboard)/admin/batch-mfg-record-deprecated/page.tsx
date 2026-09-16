import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { BmrBatchPicker, type BmrBatchOption } from "./batch-picker";

// Ravi (16 Sept 2026): "Move highlighted to Admin page and rename this to
// 'Batch Mfg. Record- Deprecated' we will later remove this functionality.
// Make a note that this needs to be removed from app later."
//
// "Highlighted" = the .docx "Batch Manufacturing Record" download that had
// been living on the Finished Product detail page's Batch header card
// (added 15 Sept 2026, see bmr-docx.ts's own history). That name collided
// with the real, unrelated `/bmr` module (docs/modules/bmr.md, Module 10 —
// DB-backed weighment/observations/sign-off), which is also labeled
// "Batch Mfg. Record" in the nav and also scoped to the same
// finished_product_batches row — flagged to Ravi rather than resolved by
// guessing (see docs/modules/finished-product.md and docs/modules/bmr.md's
// "Naming collision" notes). Ravi's resolution: move this one here, rename
// it so the two are unmistakably different things, and mark it for
// removal — Ravi said the underlying feature will go away entirely once
// it's no longer needed, this page is not a permanent home for it.
//
// TODO(remove-later): this whole route (page.tsx, batch-picker.tsx,
// bmr-download-link.tsx, bmr-docx.ts) and its nav entry
// (lib/constants/nav.ts, "Batch Mfg. Record- Deprecated") are slated for
// removal once Ravi confirms nobody still needs the legacy .docx front
// page. Tracked in the project's claude/known-issues.md until then —
// update that doc, don't just delete this comment, if the plan changes.
//
// System Admin-only, mirroring purge-test-data/page.tsx's precedent for an
// Admin page doing something Ravi wants fenced off from the app's regular
// canWrite() role set — here because it's a deprecated feature being kept
// alive on borrowed time, not because it's destructive.
export default async function BatchMfgRecordDeprecatedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isSystemAdmin = user.roles.includes("system_admin");
  const supabase = await createClient();

  let batches: BmrBatchOption[] = [];
  if (isSystemAdmin) {
    // Same eligibility rule the FP detail page used to apply: available
    // once a batch has left draft/in_process (i.e. Completed - Awaiting
    // QC onward), not gated to one exact status.
    const { data: batchRows } = await supabase
      .from("finished_product_batches")
      .select(
        "id, batch_number, target_qty, unit, batch_yield, actual_yield_pct, finish_date, batch_start_date, status, mfr_definitions(items:finished_product_item_id(item_code, name))"
      )
      // Positive list rather than .not(..., "in", ...) — same set the FP
      // detail page used to compute as `!["draft", "in_process",
      // "cancelled"].includes(status)`, just enumerated the other way
      // round for a straightforward .in() the query builder already has
      // precedent for elsewhere in this app.
      .in("status", ["complete_awaiting_qc", "submitted_to_qc", "approved", "rejected"])
      // Bug-fix precedent from docs/modules/bmr.md / purchase.md: order by
      // created_at descending, not name/batch_number, so a growing table
      // can't silently push newer batches past a server-side row cap
      // before this picker ever sees them.
      .order("created_at", { ascending: false });

    type BatchRow = {
      id: string;
      batch_number: string;
      target_qty: string | number;
      unit: string;
      batch_yield: string | number | null;
      actual_yield_pct: string | number | null;
      finish_date: string | null;
      batch_start_date: string | null;
      status: string;
      mfr_definitions: { items: { item_code: string; name: string } | null } | null;
    };
    const rows = (batchRows ?? []) as unknown as BatchRow[];
    const batchIds = rows.map((b) => b.id);

    const { data: componentRows } = batchIds.length
      ? await supabase
          .from("finished_product_components")
          .select(
            "finished_product_batch_id, quantity, purchase_line_id, items(item_code, name), purchase_lines(batch_number)"
          )
          .in("finished_product_batch_id", batchIds)
      : { data: [] };

    type ComponentRow = {
      finished_product_batch_id: string;
      quantity: string | number;
      purchase_line_id: string | null;
      items: { item_code: string; name: string } | null;
      purchase_lines: { batch_number: string } | null;
    };
    const components = (componentRows ?? []) as unknown as ComponentRow[];

    // Same "AR No. per consumed RM batch" lookup the FP detail page used to
    // do — the QC record raised against that purchase line when it was
    // originally received (quality_checks_purchase_line_unique, 0015
    // guarantees at most one row per purchase line).
    const purchaseLineIds = [...new Set(components.map((c) => c.purchase_line_id).filter((v): v is string => !!v))];
    const { data: rmQcRows } = purchaseLineIds.length
      ? await supabase.from("quality_checks").select("purchase_line_id, ar_number").in("purchase_line_id", purchaseLineIds)
      : { data: [] };
    const arByPurchaseLine = new Map((rmQcRows ?? []).map((r) => [r.purchase_line_id as string, r.ar_number as string]));

    const componentsByBatch = new Map<string, ComponentRow[]>();
    for (const c of components) {
      const list = componentsByBatch.get(c.finished_product_batch_id) ?? [];
      list.push(c);
      componentsByBatch.set(c.finished_product_batch_id, list);
    }

    batches = rows.map((b) => {
      const fpItem = b.mfr_definitions?.items ?? null;
      return {
        id: b.id,
        batchNo: b.batch_number,
        fpCode: fpItem?.item_code ?? "—",
        fpName: fpItem?.name ?? "—",
        batchSize: b.target_qty,
        unit: b.unit,
        startDate: formatDate(b.batch_start_date),
        endDate: formatDate(b.finish_date),
        batchYield: b.batch_yield ?? 0,
        yieldPct: b.actual_yield_pct ?? 0,
        // "'List of Raw Material Obtained from store on date' will be same
        // as start date of batch" — batch_start_date, same as the original
        // FP-detail-page wiring.
        rmObtainedDate: formatDate(b.batch_start_date),
        components: (componentsByBatch.get(b.id) ?? []).map((c) => ({
          rmCode: c.items?.item_code ?? "—",
          rmName: c.items?.name ?? "—",
          batchNo: c.purchase_lines?.batch_number ?? "—",
          arNumber: c.purchase_line_id ? arByPurchaseLine.get(c.purchase_line_id) ?? "" : "",
          qtyAsPerMfr: c.quantity,
        })),
      };
    });
  }

  return (
    <div>
      <PageHeader
        title="Batch Mfg. Record- Deprecated"
        description="Legacy .docx front-page download for a Finished Product batch, moved here from the Finished Product screen."
      />

      {!isSystemAdmin ? (
        <Card>
          <CardHeader title="Access restricted" />
          <CardBody className="text-sm text-muted">
            You need System Admin access to use this page. Ask an existing System Admin, or use the
            User Roles screen if you already have that access on another account.
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-3 rounded-lg border border-amber/30 bg-amber-bg px-4 py-3 text-sm text-amber">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Deprecated. This is a stateless reproduction of one specific legacy paper document — it
              is not the app&apos;s real Batch Mfg. Record module (see &ldquo;Batch Mfg. Record&rdquo; under
              Manufacturing). It moved here from the Finished Product screen and will be removed from
              the app entirely in a future update; nothing here is saved to the database.
            </p>
          </div>

          <Card>
            <CardHeader title="Download for a batch" />
            <CardBody>
              {batches.length === 0 ? (
                <p className="text-sm text-muted">No eligible batches yet.</p>
              ) : (
                <BmrBatchPicker batches={batches} />
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

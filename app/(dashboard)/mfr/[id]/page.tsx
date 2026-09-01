import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import { ApproveForm } from "./approve-form";
import { EditRecipeForm } from "./edit-recipe-form";
import { DeleteMfrForm } from "./delete-mfr-form";
import type { EditableLine } from "../mfr-line-editor";

export default async function MfrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);

  const { data: def } = await supabase
    .from("mfr_definitions")
    .select(
      "id, code, name, batch_size_qty, batch_size_unit, version, approved_by, approved_at, items:finished_product_item_id(id, item_code, name, item_types(description))"
    )
    .eq("id", id)
    .maybeSingle();

  if (!def) notFound();

  const [{ data: lines }, { data: rawItems }, approverProfile] = await Promise.all([
    supabase
      .from("mfr_lines")
      .select("id, quantity, unit, items(id, item_code, name, unit)")
      .eq("mfr_definition_id", id)
      .eq("version", def.version)
      .order("id"),
    supabase.from("items").select("id, item_code, name, unit").eq("category", "raw").eq("active", true).order("item_code"),
    def.approved_by
      ? supabase.from("profiles").select("full_name").eq("id", def.approved_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const canEdit = canWrite(user?.roles ?? [], "mfr");
  const isSystemAdmin = (user?.roles ?? []).includes("system_admin");
  const finishedProduct = def.items as unknown as {
    id: string;
    item_code: string;
    name: string;
    item_types: { description: string } | null;
  } | null;
  const itemType = finishedProduct?.item_types?.description;

  type LineRow = { id: string; quantity: string | number; unit: string; items: { id: string; item_code: string; name: string; unit: string | null } | null };
  const lineRows = (lines ?? []) as unknown as LineRow[];

  const initialLines: EditableLine[] = lineRows.map((l) => ({
    itemId: l.items?.id ?? "",
    quantity: String(l.quantity),
    unit: l.unit,
  }));

  return (
    <div>
      <PageHeader
        title={`${def.code} · ${def.name}`}
        description={`Version ${def.version} · ${finishedProduct ? finishedProduct.item_code : "No Finished Product item linked"}`}
        action={<LinkButton href={`/mfr/${id}/report`}>Print MFR</LinkButton>}
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader title="Header" />
          <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between sm:block">
              <span className="text-muted">Code</span>
              <span className="sm:block sm:mt-1 font-medium">{def.code}</span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-muted">Name</span>
              <span className="sm:block sm:mt-1 font-medium">{def.name}</span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-muted">Batch size</span>
              <span className="sm:block sm:mt-1 font-medium">
                {formatNumber(def.batch_size_qty)} {def.batch_size_unit}
              </span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-muted">Finished product</span>
              <span className="sm:block sm:mt-1 font-medium">
                {finishedProduct ? (
                  <Link href={`/items/${finishedProduct.id}`} className="text-brand hover:underline">
                    {finishedProduct.item_code} · {finishedProduct.name}
                  </Link>
                ) : (
                  "— (created before this MFR/item link existed)"
                )}
              </span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-muted">Item type</span>
              <span className="sm:block sm:mt-1 font-medium">{itemType ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 sm:col-span-2 border-t border-border pt-3">
              <div>
                <span className="text-muted">Approval</span>
                <div className="mt-1">
                  {def.approved_by ? (
                    <Badge status="approved">
                      Approved by {approverProfile?.data?.full_name ?? "—"} on {formatDate(def.approved_at)}
                    </Badge>
                  ) : (
                    <Badge status="not_submitted">Not approved</Badge>
                  )}
                </div>
              </div>
              {!def.approved_by && canEdit && <ApproveForm mfrId={id} />}
            </div>
            {isSystemAdmin && (
              <div className="flex justify-end sm:col-span-2 border-t border-border pt-3">
                <DeleteMfrForm id={id} code={def.code} name={def.name} />
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={`Recipe · version ${def.version}`} />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5">Quantity</th>
                    <th className="px-4 py-2.5">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {lineRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-muted">
                        No recipe lines on this version.
                      </td>
                    </tr>
                  )}
                  {lineRows.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">
                        {l.items ? `${l.items.item_code} · ${l.items.name}` : "—"}
                      </td>
                      <td className="px-4 py-2.5">{formatNumber(l.quantity)}</td>
                      <td className="px-4 py-2.5">{l.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && (
              <div className="border-t border-border p-4">
                <EditRecipeForm mfrId={id} currentVersion={def.version} rawItems={rawItems ?? []} initialLines={initialLines} />
              </div>
            )}
          </CardBody>
        </Card>

        {def.version > 1 && (
          <p className="text-xs text-muted">
            Versions 1–{def.version - 1} of this recipe are retained in the database for history but are not yet
            browsable from this screen (known follow-up — see docs/modules/mfr.md).
          </p>
        )}
      </div>
    </div>
  );
}

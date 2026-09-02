"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PurchaseLinesTable, type LineRow } from "./purchase-lines-table";
import { PurchaseLineForm, EditPurchaseLineForm, type RawItemOption } from "../purchase-line-form";

// FB-0018: lifts "which line (if any) is being edited" above both the
// table and the Add-line form, so clicking Edit on a row swaps the
// Add-line form for a pre-filled EditPurchaseLineForm in the same spot,
// and saving/cancelling swaps it back. Only rendered in place of the two
// separate cards page.tsx used to render directly once a PO can have
// lines that aren't editable (submitted) at all.
export function PurchaseLinesSection({
  purchaseOrderId,
  rows,
  items,
  canEditLines,
}: {
  purchaseOrderId: string;
  rows: LineRow[];
  items: RawItemOption[];
  canEditLines: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = editingId ? (rows.find((r) => r.id === editingId) ?? null) : null;

  return (
    <>
      <Card className="mb-6">
        <CardHeader title="Purchase lines" />
        <PurchaseLinesTable rows={rows} editable={canEditLines} onEdit={(id) => setEditingId(id)} />
      </Card>

      {canEditLines && (
        <Card>
          <CardHeader title={editingRow ? `Edit line — ${editingRow.item?.item_code ?? ""}` : "Add line"} />
          <CardBody>
            {editingRow ? (
              <EditPurchaseLineForm line={editingRow} onDone={() => setEditingId(null)} />
            ) : (
              <PurchaseLineForm purchaseOrderId={purchaseOrderId} items={items} />
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}

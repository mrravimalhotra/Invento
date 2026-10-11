"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
import { flash } from "@/lib/flash";
import { VendorContactLine } from "./vendor-contact-line";
import { useEffect, useState } from "react";
import { createPurchaseOrder, type CreatePurchaseOrderState } from "@/lib/actions/purchase";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { isLegacyCode, todayIst } from "@/lib/utils";
import { PurchaseOrderView } from "./purchase-order-view";
import type { RawItemOption } from "./purchase-line-form";

type VendorOption = { id: string; vendor_code: string; name: string; address: string | null; mobile: string | null };

// Single-screen New Purchase Order flow (13 Sept 2026 — Ravi: "have these
// two in single screen to reduce number of clicks"). Previously this
// screen was just the header form, and createPurchaseOrder redirected to
// /purchase/[id] on success — a real navigation to a very differently
// laid-out page, which read as two separate screens even though it was
// only ever one click. Now: the header form and the full purchase-order
// view (cards, lines table, Add line form) are the same component tree,
// and a successful create just swaps which part of it is showing — no
// navigation, no page reload, no re-fetch (the just-created header and
// this page's own already-fetched item list are all PurchaseOrderView
// needs for its first render; there are no lines yet).
//
// Every line-level action from here on (add/edit/delete line, Final
// Submit, Reopen) is untouched — same components, same server actions,
// same revalidatePath-driven refresh they've always used. Deliberately
// NOT attempting true zero-navigation (never touching the URL at all):
// that would require reworking how those actions refresh the page, since
// revalidatePath only auto-refreshes a route the browser is actually on.
// Instead, the address bar is updated to the real /purchase/[id] URL via
// a plain history.replaceState once the header exists — cosmetic only,
// no data fetch — so refresh/back/bookmark all land correctly on the
// real, server-rendered detail page (see the effect below).
export function PurchaseOrderForm({
  vendors,
  items,
  isSystemAdmin,
}: {
  vendors: VendorOption[];
  items: RawItemOption[];
  isSystemAdmin: boolean;
}) {
  const [state, formAction, pending] = useFlashActionState<CreatePurchaseOrderState, FormData>(createPurchaseOrder, undefined);
  const [vendorId, setVendorId] = useState("");
  const selectedVendor = vendors.find((v) => v.id === vendorId) ?? null;

  useEffect(() => {
    if (state?.success) {
      window.history.replaceState(null, "", `/purchase/${state.po.id}`);
      flash(`Purchase order ${state.po.po_number} created as Draft. Add its lines below.`, "success");
    }
  }, [state]);

  if (state?.success) {
    return <PurchaseOrderView po={state.po} lineRows={[]} rawItems={items} canEdit isSystemAdmin={isSystemAdmin} />;
  }

  return (
    <div>
      <PageHeader title="New purchase order" description="PO number is assigned automatically on save." />
      <Card className="max-w-xl">
        <CardBody>
          <form action={formAction} className="grid gap-4">
            {state?.error && <p className="text-sm text-red">{state.error}</p>}
            <Field label="Vendor" htmlFor="vendor_id" required>
              <Select id="vendor_id" name="vendor_id" required defaultValue="" onChange={(e) => setVendorId(e.target.value)}>
                <option value="" disabled>
                  Select vendor…
                </option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id} data-legacy={isLegacyCode(v.vendor_code) ? "1" : undefined}>
                    {v.vendor_code} — {v.name}
                  </option>
                ))}
              </Select>
              {selectedVendor && <VendorContactLine address={selectedVendor.address} mobile={selectedVendor.mobile} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Invoice number" htmlFor="invoice_number" required>
                <Input id="invoice_number" name="invoice_number" required />
              </Field>
              <Field label="Invoice date" htmlFor="invoice_date" required>
                <Input id="invoice_date" name="invoice_date" type="date" max={todayIst()} required />
              </Field>
              <Field label="Received on" htmlFor="received_on" required hint="The day the goods arrived. Printed as Date of Receipt on the RM label.">
                <Input id="received_on" name="received_on" type="date" max={todayIst()} defaultValue={todayIst()} required />
              </Field>
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create purchase order"}
              </Button>
              <LinkButton href="/purchase" variant="secondary">
                Cancel
              </LinkButton>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

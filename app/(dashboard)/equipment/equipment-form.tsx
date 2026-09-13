"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createEquipment, updateEquipment, deleteEquipment, type ActionState } from "@/lib/actions/equipment";
import { Field, Input, Select, Checkbox } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

type Equipment = {
  id: string;
  equipment_code: string;
  name: string;
  room_no: string | null;
  section: string | null;
  legacy_asset_id: string | null;
  quantity: number;
  calibration_status: string | null;
  last_calibration_date: string | null;
  next_calibration_due: string | null;
  active: boolean;
};

// Lives inline on the /equipment list page (see page.tsx) — same "add form
// and list share the page" pattern as Vendor Master / Item Type Master.
// `nextEquipmentCode` is a preview only (peek_next_equipment_code(),
// 0034_equipment_master.sql) — the code actually assigned on save always
// comes from get_next_equipment_code() inside createEquipment().
export function NewEquipmentForm({ nextEquipmentCode }: { nextEquipmentCode: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createEquipment, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label="Equipment code" hint="Auto-generated — assigned exactly when you save.">
        <Input value={nextEquipmentCode} readOnly disabled />
      </Field>
      <Field label="Name" htmlFor="name" required>
        <Input id="name" name="name" required autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room No." htmlFor="room_no">
          <Input id="room_no" name="room_no" />
        </Field>
        <Field label="Section" htmlFor="section">
          <Input id="section" name="section" />
        </Field>
      </div>
      <Field label="Asset ID" htmlFor="legacy_asset_id" hint="The existing printed/engraved ID tag, if any.">
        <Input id="legacy_asset_id" name="legacy_asset_id" />
      </Field>
      <Field label="Quantity" htmlFor="quantity">
        <Input id="quantity" name="quantity" type="number" step="1" min="1" defaultValue={1} />
      </Field>
      <Field label="Calibration status" htmlFor="calibration_status" hint="Leave blank if not applicable yet.">
        <Select id="calibration_status" name="calibration_status" defaultValue="">
          <option value="">—</option>
          <option value="calibrated">Calibrated</option>
          <option value="due">Due for calibration</option>
          <option value="not_applicable">Not applicable</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Last calibration date" htmlFor="last_calibration_date">
          <Input id="last_calibration_date" name="last_calibration_date" type="date" />
        </Field>
        <Field label="Next calibration due" htmlFor="next_calibration_due">
          <Input id="next_calibration_due" name="next_calibration_due" type="date" />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save equipment"}
      </Button>
    </form>
  );
}

export function EditEquipmentForm({ equipment }: { equipment: Equipment }) {
  const boundAction = updateEquipment.bind(null, equipment.id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <Field label="Equipment code">
        <Input value={equipment.equipment_code} readOnly disabled />
      </Field>
      <Field label="Name" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={equipment.name} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room No." htmlFor="room_no">
          <Input id="room_no" name="room_no" defaultValue={equipment.room_no ?? ""} />
        </Field>
        <Field label="Section" htmlFor="section">
          <Input id="section" name="section" defaultValue={equipment.section ?? ""} />
        </Field>
      </div>
      <Field label="Asset ID" htmlFor="legacy_asset_id">
        <Input id="legacy_asset_id" name="legacy_asset_id" defaultValue={equipment.legacy_asset_id ?? ""} />
      </Field>
      <Field label="Quantity" htmlFor="quantity">
        <Input
          id="quantity"
          name="quantity"
          type="number"
          step="1"
          min="1"
          defaultValue={equipment.quantity}
        />
      </Field>
      <Field label="Calibration status" htmlFor="calibration_status">
        <Select id="calibration_status" name="calibration_status" defaultValue={equipment.calibration_status ?? ""}>
          <option value="">—</option>
          <option value="calibrated">Calibrated</option>
          <option value="due">Due for calibration</option>
          <option value="not_applicable">Not applicable</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Last calibration date" htmlFor="last_calibration_date">
          <Input
            id="last_calibration_date"
            name="last_calibration_date"
            type="date"
            defaultValue={equipment.last_calibration_date ?? ""}
          />
        </Field>
        <Field label="Next calibration due" htmlFor="next_calibration_due">
          <Input
            id="next_calibration_due"
            name="next_calibration_due"
            type="date"
            defaultValue={equipment.next_calibration_due ?? ""}
          />
        </Field>
      </div>
      <Checkbox label="Active" name="active" defaultChecked={equipment.active} />
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <LinkButton href="/equipment" variant="secondary">
          Back to list
        </LinkButton>
      </div>
    </form>
  );
}

// Delete is restricted to system_admin — see deleteEquipment() in
// lib/actions/equipment.ts. Same two-step-confirm pattern as
// DeleteVendorForm / DeleteItemTypeForm.
export function DeleteEquipmentForm({ id, name }: { id: string; name: string }) {
  const boundAction = deleteEquipment.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        {state?.error && <p className="text-sm text-red">{state.error}</p>}
        <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
          Delete equipment
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-red/30 p-3">
      <p className="text-sm">
        Delete <strong>{name}</strong>? This can&apos;t be undone.
      </p>
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Yes, delete"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

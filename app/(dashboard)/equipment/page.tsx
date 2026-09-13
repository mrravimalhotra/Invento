import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { NewEquipmentForm } from "./equipment-form";
import { EquipmentTable, type EquipmentRow } from "./equipment-table";

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const canCreate = canWrite(user?.roles ?? [], "equipment");

  const [{ data, error }, nextEquipmentCode] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, equipment_code, name, room_no, section, legacy_asset_id, quantity, calibration_status")
      .eq("active", true)
      .order("room_no")
      .order("equipment_code"),
    // Non-consuming preview (0034_equipment_master.sql) — skip the call
    // entirely when the Add-equipment panel won't render.
    canCreate ? supabase.rpc("peek_next_equipment_code").then((r) => r.data ?? "EQ-…") : Promise.resolve(null),
  ]);

  const rows = (data ?? []) as EquipmentRow[];
  const createdRow = created ? rows.find((r) => r.equipment_code === created) : undefined;

  return (
    <div>
      <PageHeader
        title="Instrument / Equipment Master"
        description="Instruments and equipment by room and section. Equipment code is generated automatically on create. Seeded from the December 2023 room-wise register; calibration status starts blank for every entry since no historical calibration data exists."
      />

      {createdRow && (
        <p className="mb-4 rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
          New equipment &quot;{createdRow.name}&quot; ({createdRow.equipment_code}) has been successfully added.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-red">{error.message}</p>}

      <div className={canCreate ? "grid items-start gap-6 lg:grid-cols-[360px_1fr]" : undefined}>
        {canCreate && nextEquipmentCode && (
          <Card className="lg:sticky lg:top-4">
            <CardHeader title="Add new equipment" />
            <CardBody>
              <NewEquipmentForm nextEquipmentCode={nextEquipmentCode} />
            </CardBody>
          </Card>
        )}
        <Card>
          <EquipmentTable rows={rows} />
        </Card>
      </div>
    </div>
  );
}

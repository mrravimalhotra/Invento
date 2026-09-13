import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EditEquipmentForm, DeleteEquipmentForm } from "../equipment-form";

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: equipment } = await supabase
    .from("equipment")
    .select(
      "id, equipment_code, name, room_no, section, legacy_asset_id, quantity, calibration_status, last_calibration_date, next_calibration_due, active"
    )
    .eq("id", id)
    .maybeSingle();

  if (!equipment) notFound();

  const canEdit = canWrite(user?.roles ?? [], "equipment");
  const isSystemAdmin = (user?.roles ?? []).includes("system_admin");

  return (
    <div>
      <PageHeader title={equipment.name} description={`Equipment ${equipment.equipment_code}`} />
      <Card className="max-w-xl">
        <CardBody>
          {canEdit ? (
            <div className="flex flex-col gap-6">
              <EditEquipmentForm equipment={equipment} />
              {isSystemAdmin && <DeleteEquipmentForm id={equipment.id} name={equipment.name} />}
            </div>
          ) : (
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Room</dt>
                <dd>{equipment.room_no ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Section</dt>
                <dd>{equipment.section ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Asset ID</dt>
                <dd>{equipment.legacy_asset_id ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Quantity</dt>
                <dd>{equipment.quantity}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Calibration status</dt>
                <dd>{equipment.calibration_status ?? "—"}</dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

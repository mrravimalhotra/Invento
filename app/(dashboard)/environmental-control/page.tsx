import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EnvironmentalControlTable, type EnvReadingRow } from "./environmental-control-table";

export default async function EnvironmentalControlPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("environmental_control_readings")
    .select("id, area, temperature, humidity, recorded_at")
    .order("recorded_at", { ascending: false });

  const rows: EnvReadingRow[] = data ?? [];
  const canCreate = canWrite(user?.roles ?? [], "environmental_control");

  return (
    <div>
      <PageHeader
        title="Environmental Control"
        description="Temperature and humidity readings logged per area."
        action={canCreate ? <LinkButton href="/environmental-control/new">New reading</LinkButton> : undefined}
      />
      <Card>
        <EnvironmentalControlTable rows={rows} />
      </Card>
    </div>
  );
}

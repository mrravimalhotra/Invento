import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber } from "@/lib/utils";

type EnvReadingRow = {
  id: string;
  area: string;
  temperature: string | number | null;
  humidity: string | number | null;
  recorded_at: string;
};

export default async function EnvironmentalControlPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("environmental_control_readings")
    .select("id, area, temperature, humidity, recorded_at")
    .order("recorded_at", { ascending: false });

  const rows: EnvReadingRow[] = data ?? [];
  const canCreate = canWrite(user?.roles ?? [], "environmental_control");

  const columns: Column<EnvReadingRow>[] = [
    { header: "Area", accessor: (r) => <span className="font-medium">{r.area}</span>, searchValue: (r) => r.area },
    { header: "Temperature (°C)", accessor: (r) => formatNumber(r.temperature, 1) },
    { header: "Humidity (%RH)", accessor: (r) => formatNumber(r.humidity, 1) },
    { header: "Recorded at", accessor: (r) => formatDate(r.recorded_at) },
  ];

  return (
    <div>
      <PageHeader
        title="Environmental Control"
        description="Temperature and humidity readings logged per area."
        action={canCreate ? <LinkButton href="/environmental-control/new">New reading</LinkButton> : undefined}
      />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          searchPlaceholder="Search by area…"
          emptyLabel="No environmental readings recorded yet."
        />
      </Card>
    </div>
  );
}

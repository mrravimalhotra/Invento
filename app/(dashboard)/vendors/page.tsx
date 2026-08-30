import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { VendorsTable, type VendorRow } from "./vendors-table";

export default async function VendorsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("id, vendor_code, name, mobile, phone, email")
    .eq("active", true)
    .order("vendor_code");

  const rows = (data ?? []) as VendorRow[];
  const canCreate = canWrite(user?.roles ?? [], "vendors");

  return (
    <div>
      <PageHeader
        title="Vendor Master"
        description="Vendors supplying raw materials and packaging. Vendor code is generated automatically on create."
        action={
          canCreate ? (
            <LinkButton href="/vendors/new">
              <Plus className="h-4 w-4" /> New vendor
            </LinkButton>
          ) : undefined
        }
      />
      {error && <p className="mb-4 text-sm text-red">{error.message}</p>}
      <Card>
        <VendorsTable rows={rows} />
      </Card>
    </div>
  );
}

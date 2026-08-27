import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { VendorForm } from "../vendor-form";

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id, vendor_code, name, address, mobile, phone, email")
    .eq("id", id)
    .maybeSingle();

  if (!vendor) notFound();

  const canEdit = canWrite(user?.roles ?? [], "vendors");

  return (
    <div>
      <PageHeader title={vendor.name} description={`Vendor ${vendor.vendor_code}`} />
      <Card className="max-w-xl">
        <CardBody>
          {canEdit ? (
            <VendorForm vendor={vendor} />
          ) : (
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Address</dt>
                <dd>{vendor.address ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Mobile</dt>
                <dd>{vendor.mobile ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Phone</dt>
                <dd>{vendor.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Email</dt>
                <dd>{vendor.email ?? "—"}</dd>
              </div>
            </dl>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { NewVendorForm } from "./vendor-form";
import { VendorsTable, type VendorRow } from "./vendors-table";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const canCreate = canWrite(user?.roles ?? [], "vendors");

  const [{ data, error }, nextVendorCode] = await Promise.all([
    supabase.from("vendors").select("id, vendor_code, name, mobile, phone, email").eq("active", true).order("vendor_code"),
    // Only needed when the Add-vendor panel renders — peek_next_vendor_code()
    // is a non-consuming preview (0012_peek_next_codes.sql), skip the call
    // otherwise.
    canCreate ? supabase.rpc("peek_next_vendor_code").then((r) => r.data ?? "V-…") : Promise.resolve(null),
  ]);

  const rows = (data ?? []) as VendorRow[];
  const createdVendor = created ? rows.find((r) => r.vendor_code === created) : undefined;

  return (
    <div>
      <PageHeader
        title="Vendor Master"
        description="Vendors supplying raw materials and packaging. Vendor code is generated automatically on create."
      />

      {createdVendor && (
        <p className="mb-4 rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
          New vendor &quot;{createdVendor.name}&quot; ({createdVendor.vendor_code}) has been successfully added.
        </p>
      )}
      {error && <p className="mb-4 text-sm text-red">{error.message}</p>}

      {/* Add form and list share the page — no navigating to a separate
          /new screen and back just to add one vendor. */}
      <div className={canCreate ? "grid items-start gap-6 lg:grid-cols-[360px_1fr]" : undefined}>
        {canCreate && nextVendorCode && (
          <Card className="lg:sticky lg:top-4">
            <CardHeader title="Add new vendor" />
            <CardBody>
              <NewVendorForm nextVendorCode={nextVendorCode} />
            </CardBody>
          </Card>
        )}
        <Card>
          <VendorsTable rows={rows} />
        </Card>
      </div>
    </div>
  );
}

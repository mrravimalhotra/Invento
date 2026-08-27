import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/button";

type VendorRow = {
  id: string;
  vendor_code: string;
  name: string;
  mobile: string | null;
  phone: string | null;
  email: string | null;
};

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

  const columns: Column<VendorRow>[] = [
    {
      header: "Code",
      accessor: (r) => <span className="font-mono text-xs">{r.vendor_code}</span>,
      searchValue: (r) => r.vendor_code,
    },
    {
      header: "Name",
      accessor: (r) => (
        <Link href={`/vendors/${r.id}`} className="font-medium text-brand-dark hover:underline">
          {r.name}
        </Link>
      ),
      searchValue: (r) => r.name,
    },
    { header: "Mobile", accessor: (r) => r.mobile ?? "—", searchValue: (r) => r.mobile ?? "" },
    { header: "Phone", accessor: (r) => r.phone ?? "—", searchValue: (r) => r.phone ?? "" },
    { header: "Email", accessor: (r) => r.email ?? "—", searchValue: (r) => r.email ?? "" },
  ];

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
        <DataTable columns={columns} rows={rows} emptyLabel="No vendors yet." searchPlaceholder="Search vendors…" />
      </Card>
    </div>
  );
}

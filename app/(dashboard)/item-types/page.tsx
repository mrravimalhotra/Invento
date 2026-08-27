import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import Link from "next/link";

type ItemTypeRow = {
  id: string;
  description: string;
  active: boolean;
};

export default async function ItemTypesPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("item_types")
    .select("id, description, active")
    .order("description", { ascending: true });

  const rows: ItemTypeRow[] = data ?? [];
  const canCreate = canWrite(user?.roles ?? [], "item_types");

  const columns: Column<ItemTypeRow>[] = [
    {
      header: "Description",
      accessor: (r) => (
        <Link href={`/item-types/${r.id}`} className="font-medium text-brand hover:underline">
          {r.description}
        </Link>
      ),
      searchValue: (r) => r.description,
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.active ? "approved" : "not_submitted"}>{r.active ? "Active" : "Inactive"}</Badge>,
    },
    {
      header: "",
      accessor: (r) => (
        <Link href={`/item-types/${r.id}`} className="text-sm text-brand hover:underline">
          Edit
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Item Type Master"
        description="Categorizes items on the Item Master screen (e.g. Herb, Excipient, Bottle)."
        action={canCreate ? <LinkButton href="/item-types/new">New item type</LinkButton> : undefined}
      />
      <Card>
        <DataTable columns={columns} rows={rows} searchPlaceholder="Search item types…" emptyLabel="No item types yet." />
      </Card>
    </div>
  );
}

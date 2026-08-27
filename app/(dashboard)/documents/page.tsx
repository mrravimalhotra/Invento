import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";

type DocumentRow = {
  id: string;
  doc_type: "sop" | "stp";
  title: string;
  revision_number: number;
  file_url: string;
  effective_date: string | null;
  active: boolean;
};

export default async function DocumentsPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("documents")
    .select("id, doc_type, title, revision_number, file_url, effective_date, active")
    .eq("active", true)
    .order("title", { ascending: true });

  const rows: DocumentRow[] = data ?? [];
  const canCreate = canWrite(user?.roles ?? [], "documents");

  const columns: Column<DocumentRow>[] = [
    {
      header: "Type",
      accessor: (r) => <Badge status={r.doc_type === "sop" ? "approved" : "submitted"}>{r.doc_type.toUpperCase()}</Badge>,
      searchValue: (r) => r.doc_type,
    },
    {
      header: "Title",
      accessor: (r) => <span className="font-medium">{r.title}</span>,
      searchValue: (r) => r.title,
    },
    { header: "Revision", accessor: (r) => `Rev ${r.revision_number}` },
    { header: "Effective date", accessor: (r) => formatDate(r.effective_date) },
    {
      header: "File",
      accessor: (r) => (
        <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
          Open link
        </a>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="SOP / STP Documents"
        description="Standard Operating Procedures and Standard Testing Procedures — linked documents, versioned by revision number. Search by SOP or STP to filter by type."
        action={canCreate ? <LinkButton href="/documents/new">New document</LinkButton> : undefined}
      />
      <Card>
        <DataTable
          columns={columns}
          rows={rows}
          searchPlaceholder="Search by title, or type sop / stp…"
          emptyLabel="No documents recorded yet."
        />
      </Card>
    </div>
  );
}

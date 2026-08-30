import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { DocumentsTable, type DocumentRow } from "./documents-table";

export default async function DocumentsPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("documents")
    .select("id, doc_type, title, revision_number, file_url, effective_date, active")
    .eq("active", true)
    .order("title", { ascending: true });

  const rows: DocumentRow[] = data ?? [];
  const canCreate = canWrite(user?.roles ?? [], "documents");

  return (
    <div>
      <PageHeader
        title="SOP / STP Documents"
        description="Standard Operating Procedures and Standard Testing Procedures — linked documents, versioned by revision number. Search by SOP or STP to filter by type."
        action={canCreate ? <LinkButton href="/documents/new">New document</LinkButton> : undefined}
      />
      <Card>
        <DocumentsTable rows={rows} />
      </Card>
    </div>
  );
}

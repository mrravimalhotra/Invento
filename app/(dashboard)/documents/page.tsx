import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { DocumentsTable, type DocumentRow } from "./documents-table";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
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
      {created === "1" && (
        <p className="mb-4 rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
          New document has been successfully added.
        </p>
      )}
      <Card>
        <DocumentsTable rows={rows} />
      </Card>
    </div>
  );
}

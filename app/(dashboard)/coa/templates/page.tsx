import Link from "next/link";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";

type ItemTypeRow = { id: string; description: string };
type TemplateRow = { item_type_id: string; coa_template_lines: { id: string }[] };

// Ravi (22 Sept 2026): "First step would be to define Certificate of
// Analysis steps per item type... in Certificate of Analysis screen where
// input will be Item Type." One row per active item type — item_types is
// the one taxonomy both Raw Material items and Finished Product (MFR)
// recipes already share, so a template keyed to it resolves either
// subject at generation time (see 0059_coa_templates.sql).
export default async function CoaTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canManage = canWrite(user.roles, "coa");
  const supabase = await createClient();

  const [{ data: itemTypes }, { data: templates }] = await Promise.all([
    supabase.from("item_types").select("id, description").eq("active", true).order("description"),
    fetchAllRows((from, to) =>
      supabase.from("coa_templates").select("item_type_id, coa_template_lines(id)")
        .order("id", { ascending: true })
        .range(from, to).returns<TemplateRow[]>()
    ),
  ]);

  const lineCountByItemType = new Map((templates ?? []).map((t) => [t.item_type_id, t.coa_template_lines.length]));

  return (
    <div>
      <PageHeader
        title="Certificate of Analysis — Templates"
        description="One Test/Specification template per Item Type. A batch's Item Type determines which template its certificate is generated from."
        action={
          <Link href="/coa" className="text-sm text-brand hover:underline">
            Back to Certificate of Analysis
          </Link>
        }
      />

      {!canManage ? (
        <Card>
          <CardBody className="text-sm text-muted">
            You need System Admin, Quality Checker, or QC Reviewer access to manage COA templates.
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {(itemTypes ?? []).length === 0 && (
              <CardBody className="text-sm text-muted">
                No item types on file yet — add one on Item Type Master first.
              </CardBody>
            )}
            {(itemTypes ?? []).map((it: ItemTypeRow) => {
              const lineCount = lineCountByItemType.get(it.id) ?? 0;
              return (
                <div key={it.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{it.description}</p>
                    <p className="text-xs text-muted">
                      {lineCount > 0 ? `${lineCount} test${lineCount === 1 ? "" : "s"} defined` : "No template yet"}
                    </p>
                  </div>
                  <Link href={`/coa/templates/${it.id}`} className="text-sm text-brand hover:underline">
                    {lineCount > 0 ? "Edit template" : "Add template"}
                  </Link>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { TemplateEditForm } from "./template-edit-form";

export default async function CoaTemplateEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemTypeId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { itemTypeId } = await params;
  const { saved } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: itemType } = await supabase
    .from("item_types")
    .select("id, description")
    .eq("id", itemTypeId)
    .maybeSingle();
  if (!itemType) notFound();

  const { data: template } = await supabase
    .from("coa_templates")
    .select("id, coa_template_lines(seq, test, specification)")
    .eq("item_type_id", itemTypeId)
    .maybeSingle();

  const canManage = canWrite(user.roles, "coa");
  const initialLines = (template?.coa_template_lines ?? [])
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((l) => ({ test: l.test, specification: l.specification }));

  return (
    <div>
      <PageHeader
        title={`COA Template — ${itemType.description}`}
        description="The Test/Specification list every certificate generated for this Item Type starts from."
        action={
          <Link href="/coa/templates" className="text-sm text-brand hover:underline">
            Back to Templates
          </Link>
        }
      />

      {saved === "1" && (
        <p className="mb-4 rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
          Template saved.
        </p>
      )}

      {!canManage ? (
        <Card>
          <CardBody className="text-sm text-muted">
            You need System Admin, Quality Checker, or QC Reviewer access to manage COA templates.
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <TemplateEditForm itemTypeId={itemType.id} initialLines={initialLines} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

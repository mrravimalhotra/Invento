import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, StatCard } from "@/components/ui/card";
import { RegisterTable, type RegisterRow } from "./register-table";

type RawRow = Omit<RegisterRow, "last_changed_by_name"> & { last_changed_by: string | null };

const TYPE_TABS = [
  { key: "all", label: "All" },
  { key: "raw_material", label: "Raw materials" },
  { key: "finished_product", label: "Finished products (MFR)" },
] as const;
const STATUS_TABS = [
  { key: "all", label: "Any status" },
  { key: "missing", label: "Missing" },
  { key: "defined", label: "Defined" },
] as const;

// Ravi (3 Oct 2026): COA templates are defined per raw material and per MFR,
// but "COA is not part of MFR so should be tracked and reported separately".
// This register is that report: every raw material and every MFR, whether it
// has a template, how many tests, how often it changed and by whom. Rows with
// no template are the ones that block issuing a certificate.
export default async function CoaTemplateRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { type = "all", status = "all" } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data } = await fetchAllRows((from, to) =>
    supabase
      .from("coa_template_register")
      .select("subject_type, subject_id, code, name, item_type, active, template_id, tests, revisions, last_changed_at, last_changed_by")
      .order("subject_id", { ascending: true })
      .range(from, to)
      .returns<RawRow[]>()
  );
  const all = data ?? [];

  const whoIds = all.map((r) => r.last_changed_by).filter((x): x is string => !!x);
  const { data: profiles } = await fetchByIdChunks<{ id: string; full_name: string | null }>(whoIds, (chunk) =>
    supabase.from("profiles").select("id, full_name").in("id", chunk)
  );
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));

  const withNames: RegisterRow[] = all
    .map(({ last_changed_by, ...rest }) => ({ ...rest, last_changed_by_name: last_changed_by ? nameById.get(last_changed_by) ?? null : null }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const count = (t: RegisterRow["subject_type"], onlyDefined: boolean) =>
    withNames.filter((r) => r.active && r.subject_type === t && (!onlyDefined || r.template_id)).length;

  const rows = withNames.filter(
    (r) =>
      (type === "all" || r.subject_type === type) &&
      (status === "all" || (status === "missing" ? !r.template_id : !!r.template_id))
  );

  const href = (t: string, s: string) => `/coa/templates?type=${t}&status=${s}`;
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm ${active ? "bg-brand text-white" : "bg-black/5 text-foreground hover:bg-black/10"}`;

  return (
    <div>
      <PageHeader
        title="COA Template Register"
        description="Every raw material and every MFR, and whether its Certificate of Analysis template is defined. Templates are edited on the item or MFR page."
        action={
          <Link href="/coa" className="text-sm text-brand hover:underline">
            Back to Certificate of Analysis
          </Link>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Active raw materials with a template"
          value={`${count("raw_material", true)} of ${count("raw_material", false)}`}
          href={href("raw_material", "missing")}
        />
        <StatCard
          label="Active MFRs with a template"
          value={`${count("finished_product", true)} of ${count("finished_product", false)}`}
          href={href("finished_product", "missing")}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TYPE_TABS.map((t) => (
          <Link key={t.key} href={href(t.key, status)} className={tab(type === t.key)}>
            {t.label}
          </Link>
        ))}
        <span className="mx-1 text-muted">·</span>
        {STATUS_TABS.map((s) => (
          <Link key={s.key} href={href(type, s.key)} className={tab(status === s.key)}>
            {s.label}
          </Link>
        ))}
      </div>

      <Card>
        <RegisterTable rows={rows} />
      </Card>
      <CardBody className="px-0 text-xs text-muted">
        Packaging materials have no COA. A certificate cannot be issued for a batch whose raw material or MFR shows
        Missing.
      </CardBody>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

type Line = { seq: number; test: string; specification: string };

// What changed between two saves, matched on the test name: tests added,
// tests removed, and tests whose specification was reworded.
function diff(prev: Line[] | null, now: Line[]) {
  if (!prev) return { first: true as const };
  const before = new Map(prev.map((l) => [l.test, l.specification]));
  const after = new Map(now.map((l) => [l.test, l.specification]));
  return {
    first: false as const,
    added: now.filter((l) => !before.has(l.test)),
    removed: prev.filter((l) => !after.has(l.test)),
    changed: now
      .filter((l) => before.has(l.test) && before.get(l.test) !== l.specification)
      .map((l) => ({ test: l.test, from: before.get(l.test) ?? "", to: l.specification })),
  };
}

// The change history of one COA template (the page behind "History" on the
// item / MFR card and in the COA Template Register).
export default async function CoaTemplateHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("coa_templates")
    .select("id, item_id, mfr_definition_id, coa_template_lines(seq, test, specification)")
    .eq("id", id)
    .maybeSingle();
  if (!template) notFound();

  const [{ data: item }, { data: mfr }, { data: revisions }] = await Promise.all([
    template.item_id
      ? supabase.from("items").select("id, item_code, name").eq("id", template.item_id).maybeSingle()
      : Promise.resolve({ data: null }),
    template.mfr_definition_id
      ? supabase.from("mfr_definitions").select("id, code, name").eq("id", template.mfr_definition_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("coa_template_revisions")
      .select("revision_no, lines, changed_by, changed_at")
      .eq("coa_template_id", id)
      .order("revision_no", { ascending: false })
      .returns<{ revision_no: number; lines: Line[]; changed_by: string | null; changed_at: string }[]>(),
  ]);

  const whoIds = [...new Set((revisions ?? []).map((r) => r.changed_by).filter((x): x is string => !!x))];
  const { data: profiles } = whoIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", whoIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const subject = item
    ? { label: `${item.item_code} · ${item.name}`, href: `/items/${item.id}`, kind: "Raw material" }
    : mfr
      ? { label: `${mfr.code} · ${mfr.name}`, href: `/mfr/${mfr.id}`, kind: "Finished product (MFR)" }
      : { label: "Unknown", href: "/coa/templates", kind: "" };

  const current = template.coa_template_lines.slice().sort((a, b) => a.seq - b.seq);
  const revs = revisions ?? [];

  return (
    <div>
      <PageHeader
        title="COA template history"
        description={`${subject.kind} · ${subject.label}`}
        action={
          <div className="flex gap-4 text-sm">
            <Link href={subject.href} className="text-brand hover:underline">
              Open {item ? "item" : "MFR"} to edit
            </Link>
            <Link href="/coa/templates" className="text-brand hover:underline">
              COA Template Register
            </Link>
          </div>
        }
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader title="Current template" />
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="w-12 px-4 py-2">S.N.</th>
                    <th className="w-64 px-4 py-2">Test</th>
                    <th className="px-4 py-2">Specification</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((l, i) => (
                    <tr key={l.seq} className="border-b border-border align-top last:border-0">
                      <td className="px-4 py-2 text-muted">{i + 1}.</td>
                      <td className="whitespace-pre-wrap px-4 py-2">{l.test}</td>
                      <td className="whitespace-pre-wrap px-4 py-2">{l.specification}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Changes" />
          <CardBody className="flex flex-col gap-5">
            {revs.length === 0 && <p className="text-sm text-muted">No changes recorded.</p>}
            {revs.map((r, idx) => {
              const prev = revs[idx + 1]?.lines ?? null;
              const d = diff(prev, r.lines);
              return (
                <div key={r.revision_no} className="border-b border-border pb-4 last:border-0 last:pb-0">
                  <p className="text-sm font-medium">
                    Change {r.revision_no}
                    <span className="font-normal text-muted">
                      {" "}
                      · {formatDateTime(r.changed_at)}
                      {r.changed_by ? ` · ${nameById.get(r.changed_by) ?? "unknown user"}` : ""} · {r.lines.length} test
                      {r.lines.length === 1 ? "" : "s"}
                    </span>
                  </p>
                  {d.first ? (
                    <p className="mt-1 text-sm text-muted">Template created.</p>
                  ) : d.added.length + d.removed.length + d.changed.length === 0 ? (
                    <p className="mt-1 text-sm text-muted">Saved with no change to the tests or specifications.</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1 text-sm">
                      {d.added.map((l) => (
                        <li key={`a-${l.test}`} className="text-brand-dark">
                          Added: {l.test} — {l.specification}
                        </li>
                      ))}
                      {d.removed.map((l) => (
                        <li key={`r-${l.test}`} className="text-red">
                          Removed: {l.test} — {l.specification}
                        </li>
                      ))}
                      {d.changed.map((c) => (
                        <li key={`c-${c.test}`}>
                          Changed: {c.test} — <span className="text-muted line-through">{c.from}</span> → {c.to}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

import type { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type { EditableTemplateLine } from "@/lib/coa-template-lines";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type LoadedCoaTemplate = {
  templateId: string | null;
  lines: EditableTemplateLine[];
  lastChanged: string | null; // e.g. "3 Oct 2026 by Priya"
};

// Reads the COA template of one raw material (itemId) or one MFR (mfrId)
// for its detail page. An item with no template yet is an empty result,
// not an error.
export async function loadCoaTemplate(
  supabase: Supabase,
  subject: { itemId: string } | { mfrId: string }
): Promise<LoadedCoaTemplate> {
  const base = supabase
    .from("coa_templates")
    .select("id, created_at, updated_at, created_by, updated_by, coa_template_lines(seq, test, specification)");
  const { data } = await ("itemId" in subject
    ? base.eq("item_id", subject.itemId)
    : base.eq("mfr_definition_id", subject.mfrId)
  ).maybeSingle<{
    id: string;
    created_at: string | null;
    updated_at: string | null;
    created_by: string | null;
    updated_by: string | null;
    coa_template_lines: { seq: number; test: string; specification: string }[];
  }>();

  if (!data) return { templateId: null, lines: [], lastChanged: null };

  const lines = data.coa_template_lines
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((l) => ({ test: l.test, specification: l.specification }));

  const whoId = data.updated_by ?? data.created_by;
  const when = data.updated_at ?? data.created_at;
  let who: string | null = null;
  if (whoId) {
    const { data: p } = await supabase.from("profiles").select("full_name").eq("id", whoId).maybeSingle();
    who = p?.full_name ?? null;
  }
  const lastChanged = when ? `${formatDateTime(when)}${who ? ` by ${who}` : ""}` : null;
  return { templateId: data.id, lines, lastChanged };
}

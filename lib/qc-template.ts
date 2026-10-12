import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type QcTemplateInfo = {
  /** Raw material bought from a vendor and finished product have a COA, so QC records results. */
  needsResults: boolean;
  /** Tests of the COA template, in order. Empty when there is no template (yet). */
  lines: { seq: number; test: string; specification: string }[];
  /** Where the template is added (the item's or the MFR's page), when it is missing. */
  addHref: string | null;
};

/**
 * The COA template that applies to a QC record: the raw material's own template (purchase
 * line) or the MFR's (finished product batch). A Production-made raw material has no COA, so
 * no results are recorded for it.
 */
export async function loadQcTemplate(
  supabase: Supabase,
  qc: { purchase_line_id: string | null; finished_product_batch_id: string | null }
): Promise<QcTemplateInfo> {
  let subject: { itemId: string } | { mfrId: string } | null = null;
  if (qc.purchase_line_id) {
    const { data } = await supabase.from("purchase_lines").select("item_id").eq("id", qc.purchase_line_id).maybeSingle();
    if (data?.item_id) subject = { itemId: data.item_id as string };
  } else if (qc.finished_product_batch_id) {
    const { data } = await supabase
      .from("finished_product_batches")
      .select("mfr_definition_id")
      .eq("id", qc.finished_product_batch_id)
      .maybeSingle();
    if (data?.mfr_definition_id) subject = { mfrId: data.mfr_definition_id as string };
  }
  if (!subject) return { needsResults: false, lines: [], addHref: null };

  const base = supabase.from("coa_templates").select("id, coa_template_lines(seq, test, specification)");
  const { data: template } = await ("itemId" in subject
    ? base.eq("item_id", subject.itemId)
    : base.eq("mfr_definition_id", subject.mfrId)
  ).maybeSingle<{ id: string; coa_template_lines: { seq: number; test: string; specification: string }[] }>();

  const lines = (template?.coa_template_lines ?? []).slice().sort((a, b) => a.seq - b.seq);
  const addHref = "itemId" in subject ? `/items/${subject.itemId}#coa-template` : `/mfr/${subject.mfrId}#coa-template`;
  return { needsResults: true, lines, addHref };
}

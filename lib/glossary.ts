// UX-07 part 2 (Ravi, 25 Oct 2026): what the short terms on screens mean. Shown as a
// hover / tap hint on table headings (DataTable) and listed on the User Guide page.

export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "AR No.", meaning: "Analytical Report number: the QC record number given when a batch is sent to QC (ARRM-… for raw material, ARFP-… for finished product)." },
  { term: "MFR", meaning: "Master Formula Record: the approved recipe and procedure for one finished product." },
  { term: "COA", meaning: "Certificate of Analysis: the QC certificate issued for an approved batch." },
  { term: "RM-FP", meaning: "Raw material made from a finished product, when finished product is issued to Production in Packaging." },
  { term: "RM", meaning: "Raw material." },
  { term: "FP", meaning: "Finished product." },
  { term: "PQTY", meaning: "Purchased quantity of the batch." },
  { term: "SQTY", meaning: "Samples taken from the batch (QC, stability and R&D)." },
  { term: "QTY", meaning: "Stock left in the batch." },
  { term: "GST", meaning: "Goods and Services Tax." },
  { term: "R&D", meaning: "Research and development sample, kept for development work." },
];

// Words in a heading that count as the term (AR Number and AR are the same thing).
const ALIASES: Record<string, string> = { "AR Number": "AR No.", AR: "AR No." };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The glossary entries a piece of text mentions, longest terms first, each once. */
export function termsIn(text: string): { term: string; meaning: string }[] {
  const names = [...GLOSSARY.map((g) => g.term), ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length);
  let rest = text;
  const found: string[] = [];
  for (const name of names) {
    const re = new RegExp(`(^|[^A-Za-z0-9-])${escape(name)}(?![A-Za-z0-9-])`);
    if (re.test(rest)) {
      const canonical = ALIASES[name] ?? name;
      if (!found.includes(canonical)) found.push(canonical);
      rest = rest.replace(re, "$1 ");
    }
  }
  return found.map((t) => GLOSSARY.find((g) => g.term === t)!);
}

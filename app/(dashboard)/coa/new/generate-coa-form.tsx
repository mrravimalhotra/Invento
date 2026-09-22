"use client";

import { useActionState, useState } from "react";
import { generateCoaCertificate, type ActionState, type HeaderField } from "@/lib/actions/coa";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

export type TemplateLine = { seq: number; test: string; specification: string };

// Ravi (22 Sept 2026): "At this time, actual results will be input in the
// form against each test. Once submitted, the certificate of analysis
// can be downloaded in pdf." Header fields are pre-filled from the batch/
// QC data page.tsx already resolved server-side, but left editable —
// some (Sampled Qty especially) are hand-composed wording a QC person may
// need to adjust, not a raw stored value formatted one fixed way; see
// docs/modules/coa.md's "header field sourcing" note. Submitting inserts
// a coa_records row (generateCoaCertificate, lib/actions/coa.ts) and
// redirects to the certificate's own page, where the pixel-matched PDF
// download lives (coa-pdf.ts) — this form itself has no PDF button,
// generating and printing are deliberately two different moments.
export function GenerateCoaForm({
  subjectType,
  qualityCheckId,
  initialHeaderFields,
  templateLines,
  defaultRemarks,
}: {
  subjectType: "raw_material" | "finished_product";
  qualityCheckId: string;
  initialHeaderFields: HeaderField[];
  templateLines: TemplateLine[];
  defaultRemarks: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(generateCoaCertificate, undefined);
  const [headerFields, setHeaderFields] = useState<HeaderField[]>(initialHeaderFields);
  const [results, setResults] = useState<string[]>(templateLines.map(() => ""));
  const [remarks, setRemarks] = useState(defaultRemarks);

  function updateHeader(i: number, value: string) {
    setHeaderFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, value } : f)));
  }
  function updateResult(i: number, value: string) {
    setResults((rs) => rs.map((r, idx) => (idx === i ? value : r)));
  }

  const resultLinesJson = JSON.stringify(
    templateLines.map((l, i) => ({ seq: l.seq, test: l.test, specification: l.specification, result: results[i] }))
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <input type="hidden" name="quality_check_id" value={qualityCheckId} />
      <input type="hidden" name="subject_type" value={subjectType} />
      <input type="hidden" name="header_data" value={JSON.stringify(headerFields)} />
      <input type="hidden" name="result_lines" value={resultLinesJson} />

      <div>
        <h3 className="mb-2 text-sm font-semibold">Certificate header</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {headerFields.map((f, i) => (
            <Field key={f.label} label={f.label} htmlFor={`header_${i}`}>
              <Input id={`header_${i}`} value={f.value} onChange={(e) => updateHeader(i, e.target.value)} required />
            </Field>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Test results</h3>
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-3 py-2 w-10">S.N.</th>
                <th className="px-3 py-2 w-48">Test</th>
                <th className="px-3 py-2 w-56">Specification</th>
                <th className="px-3 py-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {templateLines.map((line, i) => (
                <tr key={line.seq} className="border-b border-border last:border-0 align-top">
                  <td className="px-3 py-2.5 text-muted">{line.seq}.</td>
                  <td className="px-3 py-2">{line.test}</td>
                  <td className="px-3 py-2 text-muted">{line.specification}</td>
                  <td className="px-3 py-2">
                    <Input
                      value={results[i]}
                      onChange={(e) => updateResult(i, e.target.value)}
                      placeholder="Enter result…"
                      required
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Field
        label="Remarks"
        htmlFor="remarks"
        hint="Printed as the certificate's closing line, e.g. the standard the sample was checked against."
      >
        <Textarea id="remarks" name="remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} required />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Generating…" : "Generate certificate"}
        </Button>
        <LinkButton href="/coa" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

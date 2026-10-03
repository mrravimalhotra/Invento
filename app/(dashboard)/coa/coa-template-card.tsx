"use client";

import { useState } from "react";
import Link from "next/link";
import { useFlashActionState } from "@/lib/use-flash-action";
import { saveItemCoaTemplate, saveMfrCoaTemplate, type ActionState } from "@/lib/actions/coa-templates";
import type { EditableTemplateLine } from "@/lib/coa-template-lines";
import { Button } from "@/components/ui/button";
import { CoaTemplateLineEditor } from "./coa-template-line-editor";

// The Certificate of Analysis template of one raw material (on its Item
// Master page) or one MFR (on its MFR page). Ravi (3 Oct 2026): the
// template is defined per item, and "COA is not part of MFR so should be
// tracked and reported separately" — so it has its own card, its own Save,
// and its own history (COA → COA Template Register), and it stays editable
// after an MFR is approved (the recipe lock does not apply to it).
export function CoaTemplateCard({
  kind,
  subjectId,
  lines,
  canEdit,
  templateId,
  lastChanged,
}: {
  kind: "item" | "mfr";
  subjectId: string;
  lines: EditableTemplateLine[];
  canEdit: boolean;
  templateId: string | null;
  lastChanged: string | null;
}) {
  const [open, setOpen] = useState(false);
  const action = (kind === "item" ? saveItemCoaTemplate : saveMfrCoaTemplate).bind(null, subjectId);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(action, undefined);
  const thing = kind === "item" ? "raw material" : "MFR";

  return (
    <div className="flex flex-col gap-4">
      {lines.length === 0 ? (
        <p className="text-sm text-muted">
          No COA template yet. A certificate of analysis cannot be issued for this {thing} until one is defined.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="w-12 px-3 py-2">S.N.</th>
                <th className="w-64 px-3 py-2">Test</th>
                <th className="px-3 py-2">Specification</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2 text-muted">{i + 1}.</td>
                  <td className="px-3 py-2 whitespace-pre-wrap">{l.test}</td>
                  <td className="px-3 py-2 whitespace-pre-wrap">{l.specification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {canEdit && !open && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {lines.length > 0 ? "Edit template" : "Add template"}
          </Button>
        )}
        {lastChanged && <span className="text-xs text-muted">Last changed {lastChanged}</span>}
        {templateId && (
          <Link href={`/coa/templates/${templateId}`} className="text-brand hover:underline">
            History
          </Link>
        )}
        <Link href="/coa/templates" className="text-brand hover:underline">
          COA Template Register
        </Link>
      </div>

      {open && canEdit && (
        <form action={formAction} className="flex flex-col gap-4 rounded-md border border-amber/40 bg-amber-bg/40 p-4">
          <p className="text-xs text-muted">
            The template can be edited at any time{kind === "mfr" ? ", including after this MFR is approved" : ""}.
            Certificates already issued keep the wording they had when they were issued.
          </p>
          {state?.error && <p className="text-sm text-red">{state.error}</p>}
          {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
          <CoaTemplateLineEditor initialLines={lines} />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save template"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

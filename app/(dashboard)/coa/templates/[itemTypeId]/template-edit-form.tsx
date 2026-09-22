"use client";

import { useActionState } from "react";
import { upsertCoaTemplate, type ActionState, type EditableTemplateLine } from "@/lib/actions/coa-templates";
import { Button } from "@/components/ui/button";
import { CoaTemplateLineEditor } from "../../coa-template-line-editor";

export function TemplateEditForm({
  itemTypeId,
  initialLines,
}: {
  itemTypeId: string;
  initialLines: EditableTemplateLine[];
}) {
  const boundAction = upsertCoaTemplate.bind(null, itemTypeId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <CoaTemplateLineEditor initialLines={initialLines} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save template"}
        </Button>
      </div>
    </form>
  );
}

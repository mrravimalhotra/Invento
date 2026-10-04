"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { saveCompanySettings, type CompanyFormState } from "@/lib/actions/company";
import type { Company } from "@/lib/company";

export function CompanyForm({ company }: { company: Company }) {
  const [state, action, pending] = useFlashActionState<CompanyFormState, FormData>(saveCompanySettings, undefined);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <Field label="Company name" htmlFor="company_name" required hint="Printed directly below the logo.">
        <Input id="company_name" name="company_name" defaultValue={company.name} maxLength={120} required />
      </Field>
      <Field label="Address" htmlFor="address" hint="Printed with the licence number under the company name. Leave empty to print none.">
        <Input id="address" name="address" defaultValue={company.address} maxLength={200} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Licence label" htmlFor="licence_label" required hint="For example Mfg. Lic. No.">
          <Input id="licence_label" name="licence_label" defaultValue={company.licenceLabel} maxLength={60} required />
        </Field>
        <Field label="Licence number" htmlFor="licence_no" required hint="For example PD/AYU/111">
          <Input id="licence_no" name="licence_no" defaultValue={company.licenceNo} maxLength={60} required />
        </Field>
      </div>
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

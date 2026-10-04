import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchCompany } from "@/lib/company-server";
import { addressAndLicenceLine } from "@/lib/company";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { ATHARVA_LOGO_PNG_BASE64 } from "@/lib/atharva-logo";
import { CompanyForm } from "./company-form";

// FB-0046 (Ravi, 4 Oct 2026): the company name, address and licence number
// printed on every report, slip, certificate, label and Word document. Anyone
// can see them; only the System Administrator can change them.
export default async function CompanyPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.roles.includes("system_admin") ?? false;
  const supabase = await createClient();
  const company = await fetchCompany(supabase);

  return (
    <div>
      <PageHeader
        title="Company Details"
        description="The company name, address and licence number printed on reports, intimation slips, certificates, labels and Word documents."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={isAdmin ? "Edit details" : "Current details"} />
          <CardBody>
            {isAdmin ? (
              <CompanyForm company={company} />
            ) : (
              <div className="flex flex-col gap-1 text-sm">
                <p>
                  <span className="text-muted">Company name:</span> {company.name}
                </p>
                <p>
                  <span className="text-muted">Address:</span> {company.address || "—"}
                </p>
                <p>
                  <span className="text-muted">{company.licenceLabel}:</span> {company.licenceNo}
                </p>
                <p className="mt-2 text-xs text-muted">Only the System Administrator can change these.</p>
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="How it prints" />
          <CardBody>
            <div className="flex flex-col items-center gap-1 rounded-md border border-border p-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/png;base64,${ATHARVA_LOGO_PNG_BASE64}`} alt="" className="h-14 w-auto" />
              <p className="text-base font-semibold">{company.name}</p>
              <p className="text-xs text-muted">{addressAndLicenceLine(company)}</p>
            </div>
            <p className="mt-3 text-xs text-muted">
              The logo sits on top with the company name directly below it. A change applies to the next report or
              document you download; ones already downloaded are not changed.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

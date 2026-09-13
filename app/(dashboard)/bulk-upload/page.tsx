import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { BulkUploadForm } from "./upload-form";
import { bulkUploadItems, bulkUploadVendors, bulkUploadItemTypes, bulkUploadMfr } from "@/lib/actions/bulk-upload";
import { BULK_UPLOAD_MODULE_META, type BulkUploadModuleKey } from "@/lib/bulk-upload/schemas";
import type { BulkUploadState } from "@/lib/actions/bulk-upload";

// Ravi (13 Sept 2026): "create a link in admin panel to upload data...
// as bulk upload" for Item Master, Vendor, Item Type, MFR (Purchase
// deliberately out of scope this pass — see lib/bulk-upload/schemas.ts).
// Each card below is gated by that module's own canWrite() role set, not
// admin-only (Ravi's explicit access choice) — the same people who can
// create one record at a time by hand can also bulk-import a whole file
// of them.
type ModuleCard = {
  key: BulkUploadModuleKey;
  action: (prev: BulkUploadState, formData: FormData) => Promise<BulkUploadState>;
  description: string;
};

const MODULE_CARDS: ModuleCard[] = [
  {
    key: "items",
    action: bulkUploadItems,
    description:
      "Create Raw Material and Packaging items in Item Master. Finished Product and Packaged Finished Product items are created via the MFR template below, not here.",
  },
  {
    key: "vendors",
    action: bulkUploadVendors,
    description: "Create vendors in Vendor Master.",
  },
  {
    key: "item-types",
    action: bulkUploadItemTypes,
    description: "Create item type descriptions in Item Type Master.",
  },
  {
    key: "mfr",
    action: bulkUploadMfr,
    description:
      "Create MFR recipes — one row per recipe line, grouped by repeating the same MFR Name. Also creates each MFR's paired Finished Product and Packaged Finished Product items automatically, the same way creating an MFR by hand does.",
  },
];

export default async function BulkUploadPage() {
  const user = await getCurrentUser();
  const roles = user?.roles ?? [];
  const allowed = MODULE_CARDS.filter((m) => canWrite(roles, BULK_UPLOAD_MODULE_META[m.key].module));

  return (
    <div>
      <PageHeader
        title="Bulk Data Upload"
        description="Upload master/setup data from a standard Excel template. Item, vendor, and MFR codes are always generated automatically — a file is imported only if every row in it passes validation; if anything is wrong, nothing is imported."
      />
      {allowed.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-muted">You don&apos;t have write access to any of the modules available for bulk upload.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {allowed.map((m) => (
            <Card key={m.key}>
              <CardHeader title={BULK_UPLOAD_MODULE_META[m.key].title} />
              <CardBody className="flex flex-col gap-3">
                <p className="text-sm text-muted">{m.description}</p>
                <BulkUploadForm action={m.action} templateHref={`/api/bulk-upload/template/${m.key}`} />
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

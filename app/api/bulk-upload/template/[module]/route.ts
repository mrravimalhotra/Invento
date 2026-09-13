import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { BULK_UPLOAD_MODULES, BULK_UPLOAD_MODULE_META, type BulkUploadModuleKey } from "@/lib/bulk-upload/schemas";
import { buildTemplateWorkbook } from "@/lib/bulk-upload/templates";

// GET /api/bulk-upload/template/[module] — downloads that module's blank
// .xlsx template. Gated the same way the bulk-upload page itself is
// gated (that module's own canWrite() role set, not admin-only — Ravi's
// 13 Sept 2026 access choice) rather than left open to any signed-in
// user, since the template's Reference sheet includes live item/item-type
// data from the database.
export async function GET(_request: Request, context: { params: Promise<{ module: string }> }) {
  const { module: moduleParam } = await context.params;

  if (!BULK_UPLOAD_MODULES.includes(moduleParam as BulkUploadModuleKey)) {
    return new Response("Unknown template.", { status: 404 });
  }
  const moduleKey = moduleParam as BulkUploadModuleKey;
  const meta = BULK_UPLOAD_MODULE_META[moduleKey];

  const user = await getCurrentUser();
  if (!user || !canWrite(user.roles, meta.module)) {
    return new Response("Not authorized.", { status: 403 });
  }

  const supabase = await createClient();
  const workbook = await buildTemplateWorkbook(moduleKey, supabase);
  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${meta.fileBaseName}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

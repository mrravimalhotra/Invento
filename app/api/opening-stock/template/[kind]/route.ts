import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { OPENING_KINDS, type OpeningKind } from "@/lib/opening-stock/columns";
import { buildOpeningWorkbook } from "@/lib/opening-stock/template";

// GET /api/opening-stock/template/[kind] — the blank opening stock sheet.
// Every role may load opening stock, so any signed-in user with a role may download it.
export async function GET(_request: Request, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params;
  const meta = OPENING_KINDS.find((k) => k.key === kind);
  if (!meta) return new Response("Unknown template.", { status: 404 });

  const user = await getCurrentUser();
  if (!user || user.roles.length === 0) return new Response("Not authorized.", { status: 403 });

  const supabase = await createClient();
  const workbook = await buildOpeningWorkbook(kind as OpeningKind, supabase);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${meta.fileBaseName}-template.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

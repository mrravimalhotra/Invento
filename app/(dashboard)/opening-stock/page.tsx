import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { OPENING_KINDS } from "@/lib/opening-stock/columns";
import { OpeningUploadForm } from "./upload-form";
import { OpenCloseButton, UndoButton } from "./admin-controls";

// Opening stock (Ravi, 3 Oct 2026, FB-0054 / B4). Every role may load while
// loading is open; the System Administrator closes it by hand after the agreed
// cut-off. Finished product opening stock follows in a later release.
export default async function OpeningStockPage() {
  const user = await getCurrentUser();
  const roles = user?.roles ?? [];
  const isAdmin = roles.includes("system_admin");
  const canLoad = roles.length > 0;

  const supabase = await createClient();
  const [{ data: settings }, { data: loads }] = await Promise.all([
    supabase.from("opening_stock_settings").select("is_open, closed_at, reopened_at").maybeSingle(),
    supabase.from("opening_loads").select("id, load_no, kind, row_count, summary, created_at")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(200),
  ]);
  const isOpen = settings?.is_open ?? true;
  const rowsByKind = new Map<string, number>();
  for (const l of loads ?? []) rowsByKind.set(l.kind, (rowsByKind.get(l.kind) ?? 0) + l.row_count);

  return (
    <div>
      <PageHeader
        title="Opening Stock"
        description="Load the stock on hand from the physical stock count sheet before go-live. Batches and Analytical Report numbers loaded here are tagged Legacy everywhere in the app."
      />

      <div
        className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
          isOpen ? "border-brand/30 bg-brand-light text-brand-dark" : "border-amber/30 bg-amber-bg text-amber"
        }`}
      >
        <p>
          {isOpen
            ? "Loading is open. Anyone with a role can load opening stock. The System Administrator closes it after the agreed cut-off."
            : `Loading is closed${settings?.closed_at ? ` (since ${formatDateTime(settings.closed_at)})` : ""}. No more opening stock can be loaded. The System Administrator can re-open it.`}
        </p>
        {isAdmin && <OpenCloseButton isOpen={isOpen} />}
      </div>

      <div className="flex flex-col gap-5">
        {OPENING_KINDS.map((k) => (
          <Card key={k.key}>
            <CardHeader title={`${k.title} (${rowsByKind.get(k.key) ?? 0} rows loaded)`} />
            <CardBody className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                {k.key === "raw"
                  ? "One row per batch. Each batch is Approved, Pending QC or Rejected; Approved and Rejected batches carry the old AR number and dates. Pending QC batches join the normal QC queue."
                  : "One row per lot. No QC needed. A blank Lot No is numbered by the app."}
              </p>
              {canLoad && isOpen ? (
                <OpeningUploadForm kind={k.key} templateHref={`/api/opening-stock/template/${k.key}`} />
              ) : (
                <p className="text-sm text-muted">{isOpen ? "You need a role to load opening stock." : "Loading is closed."}</p>
              )}
            </CardBody>
          </Card>
        ))}

        <Card>
          <CardHeader title="Finished Product" />
          <CardBody className="text-sm text-muted">Finished product opening stock (packed and bulk) is coming in the next release.</CardBody>
        </Card>

        <Card>
          <CardHeader title="Loads" />
          <CardBody>
            {(loads ?? []).length === 0 ? (
              <p className="text-sm text-muted">Nothing loaded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr>
                      <th className="py-2 pr-4">Load</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Rows</th>
                      <th className="py-2 pr-4">QC status</th>
                      <th className="py-2 pr-4">Loaded</th>
                      {isAdmin && <th className="py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {(loads ?? []).map((l) => {
                      const s = (l.summary ?? {}) as { approved?: number; pending?: number; rejected?: number };
                      return (
                        <tr key={l.id} className="border-t border-border">
                          <td className="py-2 pr-4 font-mono">{l.load_no}</td>
                          <td className="py-2 pr-4">{OPENING_KINDS.find((k) => k.key === l.kind)?.title ?? l.kind}</td>
                          <td className="py-2 pr-4">{l.row_count}</td>
                          <td className="py-2 pr-4 text-muted">
                            {l.kind === "raw" ? `${s.approved ?? 0} approved, ${s.pending ?? 0} pending, ${s.rejected ?? 0} rejected` : "—"}
                          </td>
                          <td className="py-2 pr-4">{formatDateTime(l.created_at)}</td>
                          {isAdmin && <td className="py-2">{isOpen && <UndoButton loadId={l.id} loadNo={l.load_no} />}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

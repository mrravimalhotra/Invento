import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Download, FileText, Workflow } from "lucide-react";
import { GLOSSARY } from "@/lib/glossary";

// Static, downloadable end-to-end user guide (Ravi, 22 Sept 2026: "Create
// an end-to-end use guide and crate a link in app for user to download
// user guide... needs to be periodically updated to reflect latest
// changes"). The PDF at /public/user-guide.pdf is generated from
// docs/user-guide/USER_GUIDE.md (the source of truth a future session
// edits and re-renders from) — see docs/modules/user-guide.md for the
// regeneration steps. This page has no write actions of its own, so
// unlike most modules it isn't gated by MODULE_WRITE_ROLES: every
// signed-in user can view and download it, the same "informational, not
// gated" pattern Reports and Audit Log's nav entry already use.
// The process map (Ravi, 12 Oct 2026: "make both available in the app under
// user guide") is a second card: the page /process-map.html is the source and
// /process-map.pdf is generated from it by scripts/build-process-map-pdf.py.
// Both are static files in /public; the sign-in check in proxy.ts covers them.
export default function UserGuidePage() {
  return (
    <div>
      <PageHeader
        title="User Guide"
        description="An end-to-end guide to using Invento — getting started, how data flows through the app, and a walkthrough of every module — and the process map that draws each flow."
      />
      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader title="Invento User Guide (PDF)" />
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-8 w-8 shrink-0 text-brand" />
              <div className="text-sm text-muted">
                <p>
                  Covers getting started, how a batch of raw material moves through Purchase, Quality
                  Control, Inventory, Manufacturing, and Certificates, what each role can do, a
                  module-by-module how-to for every screen, a glossary, and an FAQ.
                </p>
                <p className="mt-2">
                  This guide is updated whenever the app changes in a way that affects how you use it —
                  always download the latest copy from this page rather than keeping an old saved copy.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="/user-guide.pdf"
                download
                className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
              >
                <Download className="h-4 w-4" />
                Download User Guide (PDF)
              </a>
              <a
                href="/user-guide.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/5"
              >
                Open in new tab
              </a>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Invento Process Map" />
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Workflow className="mt-0.5 h-8 w-8 shrink-0 text-brand" />
              <div className="text-sm text-muted">
                <p>
                  A set of diagrams showing how raw material, packaging material and finished product
                  move through the app: purchasing and samples, two-round Quality Control, Certificates
                  of Analysis, making a batch, packing and issue, opening stock and the stock views. It
                  also lists the statuses, the documents each step produces, the rules the database
                  enforces, and the questions still open before go-live.
                </p>
                <p className="mt-2">
                  Open it to read on screen, or download the PDF to print or share.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="/process-map.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
              >
                <Workflow className="h-4 w-4" />
                Open Process Map
              </a>
              <a
                href="/process-map.pdf"
                download
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/5"
              >
                <Download className="h-4 w-4" />
                Download Process Map (PDF)
              </a>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Glossary" />
          <CardBody>
            {/* UX-07 part 2: the same meanings shown by the ⓘ hints on table headings. */}
            <dl className="grid gap-3 text-sm sm:grid-cols-[7rem_1fr]">
              {GLOSSARY.map((g) => (
                <div key={g.term} className="contents">
                  <dt className="font-semibold text-foreground">{g.term}</dt>
                  <dd className="text-muted max-sm:mb-1">{g.meaning}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

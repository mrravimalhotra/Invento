import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Download, FileText } from "lucide-react";

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
export default function UserGuidePage() {
  return (
    <div>
      <PageHeader
        title="User Guide"
        description="An end-to-end guide to using Invento — getting started, how data flows through the app, and a walkthrough of every module."
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
            <div className="flex gap-3">
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
      </div>
    </div>
  );
}

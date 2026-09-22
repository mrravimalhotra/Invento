import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Tags, Package, Truck, ShoppingCart, FlaskConical, ListTree,
  ClipboardList, FileBadge, Boxes, PackageCheck, Tag, FileCheck2, ShieldCheck,
  Thermometer, Users, BarChart3, FileText, MessageSquarePlus, Wrench, Archive,
  UploadCloud, Trash2, History, BookOpen,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; module: number };

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, module: 14 },
      // Ravi (22 Sept 2026): "create a link in app for user to download
      // user guide." Informational only, no write action of its own, so
      // it's open to every signed-in user like Dashboard itself — no
      // MODULE_WRITE_ROLES entry needed (same reasoning as Reports/Audit
      // Log's nav visibility). Module number 22 follows Audit Log (21)'s
      // precedent for post-baseline additions.
      { href: "/user-guide", label: "User Guide", icon: BookOpen, module: 22 },
    ],
  },
  {
    title: "Master data",
    items: [
      { href: "/item-types", label: "Item Type Master", icon: Tags, module: 2 },
      { href: "/items", label: "Item Master", icon: Package, module: 3 },
      { href: "/vendors", label: "Vendor Master", icon: Truck, module: 4 },
      // Not part of the original 15-module baseline — added per the
      // open-requirements-log gap analysis (13 Sept 2026); module numbers
      // 17/18 follow Feedback's precedent (module 16) for post-baseline
      // additions.
      { href: "/equipment", label: "Instrument / Equipment Master", icon: Wrench, module: 17 },
      { href: "/dead-stock", label: "Dead Stock Register", icon: Archive, module: 18 },
    ],
  },
  // Ravi (22 Sept 2026): "rename 'Procurement & QC' to 'Procurement'" —
  // Quality Control (module 6) moved out to Quality Control & Documents
  // below, so "& QC" no longer described this group's contents.
  {
    title: "Procurement",
    items: [
      { href: "/purchase", label: "Purchase", icon: ShoppingCart, module: 5 },
      { href: "/inventory", label: "Inventory Ledger", icon: ListTree, module: 7 },
    ],
  },
  // Ravi (22 Sept 2026): "rename Quality Documents to 'Quality Control &
  // Documents' and Move this link before Manufacturing." Group moved
  // ahead of Manufacturing (was after it); items/hrefs/module numbers
  // unchanged, this is ordering and title only.
  //
  // Same day, follow-up: "Move the 'Quality Control' link under 'Quality
  // Control & Documents'" — moved here from Procurement (now just
  // "Procurement", see above), first in this group since QC happens
  // before the documents (Label Printing, COA) that depend on it.
  {
    title: "Quality Control & Documents",
    items: [
      { href: "/qc", label: "Quality Control", icon: FlaskConical, module: 6 },
      { href: "/labels", label: "Label Printing", icon: Tag, module: 12 },
      { href: "/coa", label: "Certificate of Analysis", icon: FileCheck2, module: 12 },
    ],
  },
  {
    title: "Manufacturing",
    items: [
      { href: "/mfr", label: "MFR", icon: ClipboardList, module: 8 },
      { href: "/finished-product", label: "Finished Product", icon: FileBadge, module: 9 },
      // Batch Mfg. Record (module 10) moved to the Admin group below, 16
      // Sept 2026 — see that entry's comment.
      { href: "/packaging", label: "Packaging", icon: PackageCheck, module: 11 },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/user-roles", label: "User Roles & Access", icon: Users, module: 13 },
      // Not part of the original 15-module baseline — added per Ravi's
      // 21 Sept 2026 "lets fix the audit trail issue" request; module
      // number 21 follows Purge Test Data (20)'s precedent for
      // post-baseline additions. Page itself gates on canReadAudit()
      // (system_admin/super_auditor) the same way User Roles gates on
      // canWrite() above — shown to everyone here, restricted on the page.
      { href: "/audit", label: "Audit Log", icon: History, module: 21 },
      { href: "/reports", label: "Reports", icon: BarChart3, module: 15 },
      { href: "/documents", label: "SOP / STP Documents", icon: FileText, module: 12 },
      { href: "/feedback", label: "Tester Feedback", icon: MessageSquarePlus, module: 16 },
      // Not part of the original 15-module baseline — added per Ravi's
      // 13 Sept 2026 request ("create a link in admin panel to upload
      // data... as bulk upload"); module number 19 follows Equipment
      // Master (17) / Dead Stock Register (18)'s precedent for
      // post-baseline additions.
      { href: "/bulk-upload", label: "Bulk Data Upload", icon: UploadCloud, module: 19 },
      // Not part of the original 15-module baseline — added per Ravi's
      // 13 Sept 2026 request for an admin-controlled button to purge all
      // inventory/purchase data for from-scratch end-to-end testing;
      // module number 20 follows Bulk Data Upload (19)'s precedent for
      // post-baseline additions.
      { href: "/admin/purge-test-data", label: "Purge Test Data", icon: Trash2, module: 20 },
      // Ravi (16 Sept 2026): "move the highlighted 'Batch Mfg. Record' to
      // Admin page and rename this to 'Batch Mfg. Record- Deprecated' we
      // will later remove this functionality." This is the real BMR
      // module (bmr_records/weighment lines/observations/sign-off) that
      // used to be module 10 under Manufacturing at /bmr — not the
      // separate, stateless .docx download that stayed on the Finished
      // Product screen (see docs/modules/finished-product.md). Kept
      // module number 10 (its original slot), not renumbered to 21, since
      // this is a relocation of an existing module rather than a new one.
      { href: "/admin/bmr-deprecated", label: "Batch Mfg. Record- Deprecated", icon: Boxes, module: 10 },
      // Ravi (22 Sept 2026): "move 'Line Clearance' and 'Environmental
      // Control' links under Admin section and suffix them with
      // '- deprecated' as they are unlikely to be used." Same relocation-
      // plus-rename pattern as Batch Mfg. Record above (16 Sept 2026) —
      // module numbers kept as-is (both were already 12, shared with
      // Label Printing/COA under Quality documents) since this is a
      // relocation of existing modules, not new ones; label format matches
      // that same precedent ("- Deprecated", not "(deprecated)").
      { href: "/line-clearance", label: "Line Clearance- Deprecated", icon: ShieldCheck, module: 12 },
      { href: "/environmental-control", label: "Environmental Control- Deprecated", icon: Thermometer, module: 12 },
    ],
  },
];

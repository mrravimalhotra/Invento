import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Tags, Package, Truck, ShoppingCart, FlaskConical, ListTree,
  ClipboardList, FileBadge, Boxes, PackageCheck, Tag, FileCheck2, ShieldCheck,
  Thermometer, Users, BarChart3, FileText, MessageSquarePlus, Wrench, Archive,
  UploadCloud, Trash2,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; module: number };

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, module: 14 }],
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
  {
    title: "Procurement & QC",
    items: [
      { href: "/purchase", label: "Purchase", icon: ShoppingCart, module: 5 },
      { href: "/qc", label: "Quality Control", icon: FlaskConical, module: 6 },
      { href: "/inventory", label: "Inventory Ledger", icon: ListTree, module: 7 },
    ],
  },
  {
    title: "Manufacturing",
    items: [
      { href: "/mfr", label: "MFR", icon: ClipboardList, module: 8 },
      { href: "/finished-product", label: "Finished Product", icon: FileBadge, module: 9 },
      { href: "/bmr", label: "Batch Mfg. Record", icon: Boxes, module: 10 },
      { href: "/packaging", label: "Packaging", icon: PackageCheck, module: 11 },
    ],
  },
  {
    title: "Quality documents",
    items: [
      { href: "/labels", label: "Label Printing", icon: Tag, module: 12 },
      { href: "/coa", label: "Certificate of Analysis", icon: FileCheck2, module: 12 },
      { href: "/line-clearance", label: "Line Clearance", icon: ShieldCheck, module: 12 },
      { href: "/environmental-control", label: "Environmental Control", icon: Thermometer, module: 12 },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/user-roles", label: "User Roles & Access", icon: Users, module: 13 },
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
    ],
  },
];

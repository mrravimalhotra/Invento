import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Tags, Package, Truck, ShoppingCart, FlaskConical, ListTree,
  ClipboardList, FileBadge, Boxes, PackageCheck, Tag, FileCheck2, ShieldCheck,
  Thermometer, Users, BarChart3, FileText, MessageSquarePlus,
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
    ],
  },
];

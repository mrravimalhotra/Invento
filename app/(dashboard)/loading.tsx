import { PageLoading } from "@/components/ui/page-loading";

// Next.js's `loading.tsx` file convention: this wraps every page below it
// (and nested layouts/pages, e.g. inventory's own tabs layout) in a
// <Suspense> boundary automatically — it does NOT wrap app/(dashboard)/
// layout.tsx itself, so the Sidebar and Topbar stay mounted, visible, and
// interactive while this shows. See components/ui/page-loading.tsx for the
// full reasoning behind this change (21 Sept 2026, Ravi: click-registered /
// loading feedback).
export default function DashboardLoading() {
  return <PageLoading />;
}

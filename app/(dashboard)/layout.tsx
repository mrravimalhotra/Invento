import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { PageFeedback } from "@/components/feedback/page-feedback";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar user={user} />
        <main className="flex-1 overflow-x-hidden p-6">
          {children}
          <PageFeedback currentUserId={user.id} />
        </main>
      </div>
    </div>
  );
}

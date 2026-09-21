import { PageLoading } from "@/components/ui/page-loading";

// Same "click registered, next page loading" fallback as
// app/(dashboard)/loading.tsx, for the sign-in/register/reset-password
// screens — see components/ui/page-loading.tsx for the full reasoning.
export default function AuthLoading() {
  return <PageLoading />;
}

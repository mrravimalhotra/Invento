import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-form";

// SCAN-P1-01: the new-password form only makes sense with a session from the
// e-mailed link (see app/auth/confirm/route.ts). Without one, say so plainly
// instead of letting the person type a password that cannot be saved.
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">This reset link can&apos;t be used</h2>
        <p className="rounded-md bg-red-bg px-3 py-2 text-sm text-red">
          The link has expired, was already used, or was opened in a different browser than the one that asked for it.
        </p>
        <p className="text-sm text-muted">
          Ask for a new link, or ask your System Administrator to reset your password.
        </p>
        <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm />;
}

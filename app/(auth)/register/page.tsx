import Link from "next/link";

// Self-registration is closed (28 Sept 2026). Accounts are created by a
// System Admin on User Roles & Access with a temporary password that must be
// changed at first sign-in — see lib/actions/admin-users.ts. This page stays
// so old links and bookmarks explain what to do instead of 404ing.
export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Need an account?</h2>
      <p className="text-sm text-muted">
        Invento accounts are created by your System Administrator. Ask them to add you — you&apos;ll
        receive a temporary password and be asked to choose your own the first time you sign in.
      </p>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

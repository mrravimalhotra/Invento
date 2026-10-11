import Link from "next/link";

// SCAN-P7-19: an address that matches no page at all (outside the signed-in
// layout, so no menu here). Plain styling on purpose: it must work for
// signed-out visitors too.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">
        There is no page at this address. Check the address, or go back to Invento.
      </p>
      <Link
        href="/"
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Go to Invento
      </Link>
    </main>
  );
}

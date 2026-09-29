import { savedMessage } from "@/lib/saved-messages";

// Server component: pass the page's `searchParams.saved` value.
export function SavedBanner({ code }: { code: string | string[] | undefined }) {
  const message = savedMessage(code);
  if (!message) return null;
  return (
    <p role="status" className="mb-4 rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
      {message}
    </p>
  );
}

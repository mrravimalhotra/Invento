// SCAN-P7-17: a list must never look complete when part of it could not be read.
// Pass the `error` of every database read the page made; if any failed, a red
// banner says so above the list. (The raw error is logged on the server, never shown.)

type MaybeError = { message?: string } | null | undefined;

export function LoadWarning({ errors, what = "this list" }: { errors: MaybeError[]; what?: string }) {
  const failed = errors.filter(Boolean);
  if (failed.length === 0) return null;
  for (const e of failed) console.error("[load-warning]", what, e?.message ?? e);
  return (
    <p role="alert" className="mb-4 rounded-md border border-red/40 bg-red-bg px-3 py-2 text-sm text-red">
      Some of the data for {what} could not be loaded, so what you see may be incomplete. Reload the page. If it keeps
      happening, tell the administrator.
    </p>
  );
}

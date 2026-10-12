// Opening stock (0100): a batch or Analytical Report number that came from the old
// records, not from this app. Shown beside the number wherever it appears.
// Shown only when `show` is true: a missing value (undefined or null) hides the tag.
// (It used to default to true, so a row with no flag at all, for example
// `false || undefined`, was wrongly tagged Legacy.)
export function LegacyTag({ show }: { show?: boolean | null }) {
  if (show !== true) return null;
  return (
    <span
      title="Loaded as opening stock from the old records"
      className="ml-1.5 inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted align-middle"
    >
      Legacy
    </span>
  );
}

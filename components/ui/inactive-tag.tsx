// SCAN-P8-03: a retired record (made inactive), shown beside its code when the
// list is set to "Show inactive".
export function InactiveTag({ show = true }: { show?: boolean | null }) {
  if (!show) return null;
  return (
    <span
      title="Made inactive. Open the record and tick Active to bring it back."
      className="ml-1.5 inline-flex items-center rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted align-middle"
    >
      Inactive
    </span>
  );
}

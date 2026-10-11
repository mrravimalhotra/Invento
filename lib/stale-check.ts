// SCAN-P10-03 (Ravi, 12 Oct 2026): "changed since you opened it" for edit forms.
// The form carries the record's updated_at as it was loaded (hidden field `loaded_at`;
// empty means the record has never been updated). The update then only matches if the
// record is still as it was; if someone else saved first, nothing is written and the
// person is told. Plain module (no "use server"): used inside Server Actions.

export const STALE_MESSAGE =
  "Someone else changed this record while you were editing it. Nothing was saved. Reload the page to see their change, then make your edit again.";

/** undefined = the form sent no marker (skip the check); null = never updated; string = loaded value. */
export function readLoadedAt(formData: FormData): string | null | undefined {
  if (!formData.has("loaded_at")) return undefined;
  const v = String(formData.get("loaded_at") ?? "").trim();
  return v === "" ? null : v;
}

// The query builder is passed in and returned so this works for any table.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyLoadedAt<Q extends { eq: (c: string, v: any) => Q; is: (c: string, v: null) => Q }>(
  query: Q,
  loadedAt: string | null | undefined
): Q {
  if (loadedAt === undefined) return query;
  return loadedAt === null ? query.is("updated_at", null) : query.eq("updated_at", loadedAt);
}

// SCAN-P2-03 (Ravi, 12 Oct 2026): small shared rules for names and barcodes.
// The database compares names with norm_name() (migration 0115): lower case, repeated
// spaces squeezed to one, trailing spaces and full stops dropped. Plain module.

/** Same cleaning as the database function norm_name(), for matching in the app (uploads, files). */
export function normName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "").toLowerCase();
}

// A barcode is drawn as Code 128, which can only encode plain printable ASCII.
export const BARCODE_RULE = "A barcode must be 3 to 40 plain characters (letters, digits, and the usual symbols; no accents or emoji).";
export function validBarcode(raw: string): boolean {
  return /^[\x20-\x7E]{3,40}$/.test(raw);
}

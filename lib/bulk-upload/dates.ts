// ACC-23 (29 Sept 2026): bulk-upload dates were read with `new Date(text)`,
// which is US-style and time-zone dependent: "05-09-2026" (the app's own
// dd-mm-yyyy format) became 9 May, "13-09-2026" was rejected, and "05/09/2023"
// was saved as 2023-05-09. Dates are now read by explicit format only:
//
//   - a real Excel date cell (the parser hands it over as yyyy-mm-dd);
//   - yyyy-mm-dd (ISO), optionally followed by a time;
//   - dd-mm-yyyy, dd/mm/yyyy or dd.mm.yyyy (day first, 4-digit year).
//
// Anything else is refused with a message saying so, rather than guessed.

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/;
const DMY = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;

function realDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Returns yyyy-mm-dd, or null when the text isn't a date in an accepted
// format (or isn't a real calendar date, e.g. 31-02-2026).
export function parseUploadDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const iso = ISO.exec(text);
  if (iso) return realDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = DMY.exec(text);
  if (dmy) return realDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return null;
}

export const DATE_FORMAT_HINT = "use dd-mm-yyyy (e.g. 05-09-2026) or yyyy-mm-dd, or type it as a real date in Excel";

import type { jsPDF } from "jspdf";

// SCAN-P7-14 (Ravi, 12 Oct 2026: "yes, build it"): the built-in PDF font (Helvetica) prints only the
// Western set, so a rupee sign, a macron letter (Brahmī) or Hindi came out as other symbols.
// This registers Noto Sans (SIL Open Font License; regular, bold, italic; Latin, Latin Extended,
// currency, Devanagari; about 110 KB each, in public/fonts) under the name "helvetica" in ONE
// document, so every existing setFont("helvetica", ...) call and the table library use it with no
// other change. The font files are fetched when a PDF is made (not at page load) and cached by the
// browser. If a file cannot be fetched the PDF is made with the built-in font, as before.

const FILES: { file: string; style: "normal" | "bold" | "italic" | "bolditalic" }[] = [
  { file: "NotoSans-Regular.ttf", style: "normal" },
  { file: "NotoSans-Bold.ttf", style: "bold" },
  { file: "NotoSans-Italic.ttf", style: "italic" },
];

const base64Cache = new Map<string, Promise<string>>();

function fetchBase64(file: string): Promise<string> {
  let p = base64Cache.get(file);
  if (!p) {
    p = fetch(`/fonts/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`font ${file}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        // A real TrueType file starts 00 01 00 00; anything else (for example a sign-in page
        // returned in its place) must not reach the PDF library.
        if (!(bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) throw new Error(`font ${file}: not a font file`);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      });
    // A failed fetch must not be remembered, or every later PDF would fail the same way.
    p.catch(() => base64Cache.delete(file));
    base64Cache.set(file, p);
  }
  return p;
}

// Characters the font does not hold, written in plain letters instead of printing a blank box.
const PLAIN: Record<string, string> = {
  "→": "->", "←": "<-", "↑": "^", "↓": "v", "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~", "✓": "OK", "✔": "OK",
};
const PLAIN_PATTERN = new RegExp(`[${Object.keys(PLAIN).join("")}]`, "g");

// The PDF library does not re-order Hindi: the short "i" vowel sign (ि) belongs before its
// consonant group but would print after it. Move it, so the word reads right on the page.
const SHORT_I = /((?:[क-ह]्)*[क-ह]़?)ि/g;

export function pdfSafeText(s: string): string {
  if (!/[^\u0000-\u007f]/.test(s)) return s; // plain ASCII: nothing to do
  return s.replace(PLAIN_PATTERN, (c) => PLAIN[c] ?? c).replace(SHORT_I, "ि$1");
}

// Call once per document, before anything is drawn. Returns true when Noto Sans is in use.
export async function loadUnicodeFont(doc: jsPDF, opts: { italic?: boolean } = {}): Promise<boolean> {
  try {
    const wanted = FILES.filter((f) => f.style !== "italic" || opts.italic);
    const data = await Promise.all(wanted.map((f) => fetchBase64(f.file)));
    wanted.forEach((f, i) => {
      doc.addFileToVFS(f.file, data[i]);
      doc.addFont(f.file, "helvetica", f.style);
    });
    if (!opts.italic) doc.addFont("NotoSans-Regular.ttf", "helvetica", "italic");
    doc.addFont("NotoSans-Bold.ttf", "helvetica", "bolditalic");
    doc.setFont("helvetica", "normal");

    // Every text call passes through pdfSafeText (also the table library's cell text).
    const original = doc.text.bind(doc) as (...args: unknown[]) => jsPDF;
    (doc as unknown as { text: (...args: unknown[]) => jsPDF }).text = (text: unknown, ...rest: unknown[]) => {
      const fixed = Array.isArray(text)
        ? text.map((t) => (typeof t === "string" ? pdfSafeText(t) : t))
        : typeof text === "string"
          ? pdfSafeText(text)
          : text;
      return original(fixed, ...rest);
    };
    return true;
  } catch {
    return false;
  }
}

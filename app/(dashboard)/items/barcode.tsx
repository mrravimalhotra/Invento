// Minimal inline Code128 (Set B) SVG renderer — no external service/library,
// per docs/DESIGN.md §9 ("barcode is a stored value + on-screen code128
// render via a small inline SVG generator"). This module only draws a
// barcode symbol from a stored text value; scanning/label placement is the
// Label Printing module's job (docs/DESIGN.md §4.11).

// Standard Code128 module-width table, symbol values 0–106 (0–102 data/
// function, 103/104/105 = START A/B/C, 106 = STOP). Each entry is the
// width (in modules, 1–4) of alternating bar/space/bar/… starting with a
// bar; the STOP entry has an extra terminating bar.
const CODE128_WIDTHS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

function encodeCode128B(text: string): number[] | null {
  // Set B covers ASCII 32–126.
  if (!/^[\x20-\x7e]+$/.test(text)) return null;
  const values = Array.from(text).map((c) => c.charCodeAt(0) - 32);
  let checksum = START_B;
  values.forEach((v, i) => (checksum += v * (i + 1)));
  checksum %= 103;
  return [START_B, ...values, checksum, STOP];
}

/** Renders `value` as an inline Code128-B barcode SVG, or null if the value
 * has characters outside the printable-ASCII range Set B supports. */
export function Barcode({ value, height = 50 }: { value: string; height?: number }) {
  const symbols = encodeCode128B(value);
  if (!symbols) {
    return <p className="text-sm text-muted">Barcode value contains characters this renderer can&apos;t encode: {value}</p>;
  }

  const unit = 2; // px per module
  let x = 0;
  const bars: { x: number; width: number }[] = [];
  symbols.forEach((sym) => {
    const widths = CODE128_WIDTHS[sym];
    for (let i = 0; i < widths.length; i++) {
      const w = Number(widths[i]) * unit;
      const isBar = i % 2 === 0; // starts on a bar
      if (isBar) bars.push({ x, width: w });
      x += w;
    }
  });
  const totalWidth = x;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg width={totalWidth} height={height} viewBox={`0 0 ${totalWidth} ${height}`} role="img" aria-label={`Barcode ${value}`}>
        <rect x={0} y={0} width={totalWidth} height={height} fill="white" />
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={0} width={b.width} height={height} fill="black" />
        ))}
      </svg>
      <p className="font-mono text-xs tracking-widest text-muted">{value}</p>
    </div>
  );
}

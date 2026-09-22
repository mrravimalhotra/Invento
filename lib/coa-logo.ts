// Atharva Nature Healthcare logo, extracted from public/atharva-logo.svg
// (which itself just wraps this same PNG as a base64 data URI) and
// downscaled/palette-quantized to ~16KB (600x230px, 64-color palette,
// alpha preserved) so it is cheap to embed directly as a source-level
// constant rather than fetched at PDF-generation time. Used by the COA
// PDF (lib/coa-pdf.ts) to put the real company mark on generated
// certificates, matching the letterhead on Ravi's sample paper COAs
// (Certificate of Analysis, 22 Sept 2026) instead of a text-only
// approximation. Regenerate if the source logo ever changes:
//   python3 -c "import re, base64; svg = open('public/atharva-logo.svg').read(); data = re.search(r'base64,([A-Za-z0-9+/=]+)', svg).group(1); open('/tmp/logo.png', 'wb').write(base64.b64decode(data))"
// then resize to ~600px wide, quantize to a small palette (PIL:
// Image.quantize(colors=64, method=Image.FASTOCTREE)), and re-base64.
export const ATHARVA_LOGO_PNG_BASE64 =
  "data:image/png;base64,";

export const ATHARVA_LOGO_ASPECT = 600 / 230; // width / height, for sizing in the PDF

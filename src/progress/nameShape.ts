// Draw a name in the certificate's script font as an SVG path, so it looks the same everywhere
// (screen, PNG, PDF, other people's devices) without depending on fonts being loaded.
import fontUrl from '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff?url';

type OT = typeof import('opentype.js');
let fontP: Promise<import('opentype.js').Font> | null = null;
function font() {
  return (fontP ??= Promise.all([import('opentype.js') as Promise<OT & { default?: OT }>, fetch(fontUrl).then((r) => r.arrayBuffer())])
    .then(([m, buf]) => (m.parse ?? m.default!.parse)(buf)));
}

export async function nameShape(text: string, size = 128): Promise<{ d: string; w: number } | null> {
  if (!text.trim()) return null;
  try {
    return layoutName(await font(), text, size);
  } catch { return null; }
}

/** Glyph by glyph with kerning (skips opentype's shaping, which this font's features trip up). */
export function layoutName(f: import('opentype.js').Font, text: string, size = 128): { d: string; w: number } {
  const k = size / f.unitsPerEm;
  let x = 0, d = '';
  let prev: import('opentype.js').Glyph | null = null;
  for (const ch of text) {
    const g = f.charToGlyph(ch);
    if (prev) x += f.getKerningValue(prev, g) * k;
    d += g.getPath(x, 0, size).toPathData(2);
    x += (g.advanceWidth ?? 0) * k;
    prev = g;
  }
  return { d, w: x };
}

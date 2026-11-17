// Draw a name in the certificate's script font as an SVG path, so it looks the same everywhere
// (screen, PNG, PDF, other people's devices) without depending on fonts being loaded.
import fontUrl from '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff?url';

type OT = typeof import('opentype.js');
let fontP: Promise<import('opentype.js').Font> | null = null;
function font() {
  return (fontP ??= Promise.all([import('opentype.js') as Promise<OT & { default?: OT }>, fetch(fontUrl).then((r) => r.arrayBuffer())])
    .then(([m, buf]) => (m.parse ?? m.default!.parse)(buf)));
}

/** The name as paths. The first letter is kept apart: the certificate fills it with microtext of the first name. */
export interface NameShape {
  d: string;
  w: number;
  first?: { d: string; x0: number; y0: number; x1: number; y1: number };
}

export async function nameShape(text: string, size = 128): Promise<NameShape | null> {
  if (!text.trim()) return null;
  try {
    return layoutName(await font(), text, size);
  } catch { return null; }
}

/** Glyph by glyph with kerning (skips opentype's shaping, which this font's features trip up). */
export function layoutName(f: import('opentype.js').Font, text: string, size = 128): NameShape {
  const k = size / f.unitsPerEm;
  let x = 0, d = '';
  let first: NameShape['first'];
  let prev: import('opentype.js').Glyph | null = null;
  for (const ch of text) {
    const g = f.charToGlyph(ch);
    if (prev) x += f.getKerningValue(prev, g) * k;
    const p = g.getPath(x, 0, size);
    if (!first && /\p{L}/u.test(ch)) {
      const b = p.getBoundingBox();
      first = { d: p.toPathData(2), x0: b.x1, y0: b.y1, x1: b.x2, y1: b.y2 };
    } else d += p.toPathData(2);
    x += (g.advanceWidth ?? 0) * k;
    prev = g;
  }
  return { d, w: x, first };
}

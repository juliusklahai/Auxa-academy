// Turning lesson text into natural speech, and the id of each spoken line (shared with the recording script).

const ROMAN: Record<string, string> = { i: 'one', ii: 'two', iii: 'three', iv: 'four', v: 'five', vi: 'six', vii: 'seven' };
const QUAL: [RegExp, string][] = [
  [/^maj7$|^Δ7?$/, ' major seven'], [/^maj9$/, ' major nine'], [/^m7b5$|^ø7?$/, ' half diminished'], [/^m7$|^-7$/, ' minor seven'], [/^m9$/, ' minor nine'],
  [/^m6$/, ' minor six'], [/^m$/, ' minor'], [/^dim7$|^°7$/, ' diminished seven'], [/^dim$|^°$/, ' diminished'], [/^aug$|^\+$/, ' augmented'],
  [/^7b9$/, ' seven flat nine'], [/^7$/, ' seven'], [/^9$/, ' nine'], [/^13$/, ' thirteen'], [/^6$/, ' six'], [/^sus4$/, ' sus four'],
];
const letter = (l: string, acc?: string) => l + (acc === '#' || acc === '♯' ? ' sharp' : acc === 'b' || acc === '♭' ? ' flat' : '');

/** Roman numeral chord (IV, ii7, V7, vii°, bII7, I64) in words. */
function romanWords(tok: string): string | null {
  const m = /^(b|♭|#)?(vii|iii|ii|iv|vi|v|i|VII|III|II|IV|VI|V|I)(°|ø)?(maj7|7b9|7|64|6|9)?$/.exec(tok);
  if (!m) return null;
  const [, acc, num, dim, ext] = m;
  const word = ROMAN[num.toLowerCase()];
  const minor = num === num.toLowerCase() && num !== 'v' ? ' minor' : num === 'v' ? ' minor' : '';
  return `${acc ? (acc === '#' ? 'sharp ' : 'flat ') : ''}${word}${dim === '°' ? ' diminished' : dim === 'ø' ? ' half diminished' : ''}${!dim && minor && !ext ? '' : ''}${ext === 'maj7' ? ' major seven' : ext === '7b9' ? ' seven flat nine' : ext === '7' ? ' seven' : ext === '64' ? ' six four' : ext === '6' ? ' six' : ext === '9' ? ' nine' : ''}`;
}

/** Clean text for speaking: abbreviations in full, chords and numerals as words, no symbols that read badly. */
export function speakable(t: string): string {
  let x = ` ${t} `;
  // words and abbreviations
  x = x.replace(/\bRH\b/g, 'right hand').replace(/\bLH\b/g, 'left hand').replace(/\bSATB\b/g, 'soprano, alto, tenor and bass')
    .replace(/\bBPM\b|\bbpm\b/g, 'beats per minute').replace(/\bMIDI\b/g, 'midi').replace(/\bMusicXML\b/g, 'music X M L')
    .replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is').replace(/\bvs\.?\b/g, 'versus').replace(/&/g, ' and ')
    .replace(/\b(\d)\/4\b/g, (_m, n) => `${n} 4`).replace(/\b6\/8\b/g, 'six eight')
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, (_m, n: string) => ({ '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '5': 'fifth', '6': 'sixth', '7': 'seventh', '8': 'eighth', '9': 'ninth' } as Record<string, string>)[n] ?? `${n}th`);
  // chord symbols: Dm7, Cmaj7, G7, Bb7, F#m, C/E
  x = x.replace(/\b([A-G])(#|b|♯|♭)?(maj7|maj9|m7b5|m7|m9|m6|dim7|dim|aug|7b9|sus4|m|7|9|13|6|°7|°|ø7|ø)(?=[\s,.;:!?)/–—-]|$)/g, (_m, l: string, a: string | undefined, q: string) => {
    const w = QUAL.find(([re]) => re.test(q));
    return letter(l, a) + (w ? w[1] : '');
  });
  x = x.replace(/\b([A-G])(#|b|♯|♭)?\/([A-G])(#|b|♯|♭)?\b/g, (_m, l, a, l2, a2) => `${letter(l, a)} over ${letter(l2, a2)}`);
  // note names with octave numbers (C4), sharps and flats (F#, Bb)
  x = x.replace(/\b([A-G])(#|b|♯|♭)?\d\b/g, (_m, l: string, a?: string) => letter(l, a));
  x = x.replace(/\b([A-G])(#|♯)(?=\W)/g, (_m, l) => `${l} sharp`).replace(/\b([A-G])(b|♭)(?=[\s,.;:!?)–—-]|$)/g, (_m, l) => `${l} flat`);
  // Roman numeral progressions: "I – IV – V – I", "ii–V–I", "V7", "vii°"
  x = x.replace(/(?<![A-Za-z])((?:b|♭|#)?(?:vii|iii|ii|iv|vi|v|i|VII|III|II|IV|VI|V|I)(?:°|ø)?(?:maj7|7b9|7|64|6|9)?)(?:\s*[–—-]\s*((?:b|♭|#)?(?:vii|iii|ii|iv|vi|v|i|VII|III|II|IV|VI|V|I)(?:°|ø)?(?:maj7|7b9|7|64|6|9)?))+(?![A-Za-z])/g, (seq) =>
    seq.split(/\s*[–—-]\s*/).map((tk) => romanWords(tk) ?? tk).join(', '));
  x = x.replace(/(?<![A-Za-z'])((?:b|♭)?(?:vii|iii|ii|iv|vi|VII|III|II|IV|VI|V)(?:°|ø)?(?:maj7|7b9|7|64|6|9)?)(?![A-Za-z'])/g, (tk) => romanWords(tk) ?? tk);
  x = x.replace(/(?<![A-Za-z'])(I)(maj7|7|64|6)(?![A-Za-z'])/g, (tk) => romanWords(tk) ?? tk);
  // punctuation that reads badly
  x = x.replace(/\s+-\s+/g, ', ').replace(/[–—]/g, ', ').replace(/\s*·\s*/g, ', ').replace(/[()[\]{}"“”]/g, ' ').replace(/\s*:\s*/g, ', ').replace(/\s*\/\s*/g, ' or ')
    .replace(/\s*\|\s*/g, ', ').replace(/\+/g, ' and ').replace(/\.\.\./g, ',').replace(/\s*,\s*(,\s*)+/g, ', ').replace(/\s+([,.!?])/g, '$1');
  x = x.replace(/\s+/g, ' ').replace(/\b([A-G](?: sharp| flat)?) \1\b/g, '$1'); // "middle C (C4)" -> "middle C"
  return x.replace(/\s+/g, ' ').trim();
}

/** Short id for a spoken line: FNV-1a over its UTF-8 bytes (the recording script uses the same). */
export function lineKey(line: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(line)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// The certificate artwork as an SVG string (also used for the PNG download).
import { LEVEL_NAMES } from '../curriculum/levels';
import { LESSONS } from '../curriculum/lessons';
import { AUXA_PATHS, WORD_BOX } from '../ui/brandPaths';
import { SIG_BOX, SIG_STROKES } from './signature';
import QRCode from 'qrcode';
import { guilloche, sealMelody, sealWave, verifyUrl } from './certSeal';

export interface CertOpts {
  /** the name drawn as a path (so the font never changes when saved): path at baseline, font size 128 */
  nameShape?: { d: string; w: number };
  /** issued by the database: verification code and seal */
  code?: string;
  seal?: string;
}
/** A "line" that is really microscopic text running along a path (prints as a line, zooms into words). */
function micro(id: string, d: string, text: string, size: number, fill: string, len: number, weight = 600, fit = false, centre = false) {
  const per = size * 0.62;
  const reps = Math.ceil(len / (per * text.length)) + (fit ? 0 : 1);
  // fit: stretch the text to exactly the path length, so a closed frame has no gap where it meets itself
  const tl = fit ? ` textLength="${len}" lengthAdjust="spacing"` : '';
  return `<defs><path id="${id}" d="${d}"/></defs><text font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="0.15"${centre ? ' dominant-baseline="central"' : ''}><textPath href="#${id}"${tl}>${esc(text.repeat(reps))}</textPath></text>`;
}
/** The signature written in microtext: one line of text runs down the middle of every pen stroke. */
function microSignature(tag: string, text: string, k: number) {
  const size = 4.6 / k; // about 4.6 px on the certificate
  return SIG_STROKES.map((d, i) => micro(`${tag}sg${i}`, d, text, size, '#141414', 3000, 900, false, true)).join('');
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
function qrSvg(text: string, x: number, y: number, size: number) {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = q.modules.size, c = size / n;
  let d = '';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.modules.get(r, k)) d += `M${(x + k * c).toFixed(2)} ${(y + r * c).toFixed(2)}h${c.toFixed(2)}v${c.toFixed(2)}h${(-c).toFixed(2)}z`;
  return `<rect x="${x - 8}" y="${y - 8}" width="${size + 16}" height="${size + 16}" rx="6" fill="#fff"/><path d="${d}" fill="#141414"/>`;
}

export const W = 1600, H = 1130;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const SIG_K = 250 / SIG_BOX.w;
const SCRIPT = "AuxaScript, 'Great Vibes', 'Brush Script MT', cursive";

/** scriptFont: optional data URL of the cursive font, embedded so the PNG export keeps it. */
export function certificateSvg(name: string, level: number, date: string, scriptFont?: string, opts: CertOpts = {}) {
  const { nameShape, code, seal } = opts;
  const tag = `m${level}${(seal ?? code ?? 'x').slice(0, 6).replace(/[^a-zA-Z0-9]/g, '')}`;
  const border = (code ? `AUXAACADEMY${code.replace(/-/g, '')}AUTHENTIC` : 'AUXAACADEMYCERTIFICATE');
  const mt = code ? `AUXA ACADEMY · ${code} · AUTHENTIC CERTIFICATE · ` : 'AUXA ACADEMY · CERTIFICATE OF ACHIEVEMENT · ';
  const citation = wrap(certCitation(level), 92);
  const tune = seal ? sealMelody(seal) : [];
  const keys = Array.from({ length: 22 }, (_, i) => `<rect x="${560 + i * 22}" y="1010" width="20" height="56" rx="3" fill="${tune.includes(i) ? '#7fe9e4' : '#fff'}" stroke="#d9d6c8"/>`).join('')
    + tune.map((k, j) => `<g transform="translate(${570 + k * 22} ${996 - (tune.slice(0, j).filter((x) => x === k).length) * 15})"><circle r="7" fill="#047683"/><text y="3.5" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="9" font-weight="700" fill="#fff">${j + 1}</text></g>`).join('')
    + Array.from({ length: 22 }, (_, i) => ([1, 2, 4, 5, 6].includes(i % 7) && i < 21 ? `<rect x="${560 + i * 22 - 6}" y="1010" width="12" height="34" rx="2" fill="#1d1f1a"/>` : '')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${scriptFont ? `<style>@font-face{font-family:AuxaScript;src:url(${scriptFont}) format("woff2");}</style>` : ''}
  <rect width="${W}" height="${H}" fill="#fbf9f1"/>
  ${micro(`${tag}o`, `M34 36 H${W - 34} V${H - 34} H34 Z`, border, 5.2, '#141414', 2 * (W - 68) + 2 * (H - 70), 700, true)}
  ${micro(`${tag}i`, `M50 52 H${W - 50} V${H - 50} H50 Z`, mt, 3.6, '#047683', 2 * (W + H), 600)}
  <g transform="translate(${W / 2 - (WORD_BOX.w * 0.34) / 2} 104) scale(0.34) translate(${-WORD_BOX.x} ${-WORD_BOX.y})">
    <path fill="#161d26" fill-rule="evenodd" d="${AUXA_PATHS.dark_word}"/><path fill="#0aa5b4" fill-rule="evenodd" d="${AUXA_PATHS.word_cyan}"/>
  </g>
  <text x="${W / 2}" y="290" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" letter-spacing="10" fill="#047683">CERTIFICATE OF ACHIEVEMENT</text>
  <text x="${W / 2}" y="370" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="28" fill="#55554f">This certifies that</text>
  ${nameShape
    ? (() => { const sc = Math.min(1, 1080 / Math.max(1, nameShape.w)); return `<path transform="translate(${(W / 2 - (nameShape.w * sc) / 2).toFixed(1)} 490) scale(${sc.toFixed(4)})" fill="#141414" d="${nameShape.d}"/>`; })()
    : `<text x="${W / 2}" y="490" text-anchor="middle" font-family="${SCRIPT}" font-size="128" fill="#141414">${esc(name || 'An Auxa learner')}</text>`}
  ${micro(`${tag}n`, `M${W / 2 - 420} 521 H${W / 2 + 420}`, mt, 3.4, '#141414', 840)}
  <text x="${W / 2}" y="590" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="28" fill="#55554f">has successfully completed</text>
  <text x="${W / 2}" y="670" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="54" font-weight="700" fill="#141414" letter-spacing="-1">Level ${level} · ${esc(LEVEL_NAMES[level] ?? '')}</text>
  ${citation.map((l, i) => `<text x="${W / 2}" y="${716 + i * 28}" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" font-style="italic" fill="#66665f">${esc(l)}</text>`).join('')}
  <g transform="translate(240 820)">
    ${micro(`${tag}d`, 'M0 61 H340', mt, 3.4, '#141414', 340)}
    <text x="170" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-style="italic" fill="#141414">${esc(longDate(date))}</text>
    <text x="170" y="108" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" fill="#77776f">Date</text>
  </g>
  <g transform="translate(${W - 580} 820)">
    ${micro(`${tag}s`, 'M0 61 H340', mt, 3.4, '#141414', 340)}
    <g transform="translate(${170 - (SIG_BOX.w * SIG_K) / 2} ${76 - SIG_BOX.h * SIG_K}) scale(${SIG_K})">${microSignature(tag, 'JULIUSKAUXACEO', SIG_K)}</g>
    <text x="170" y="108" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" fill="#77776f">Julius K · CEO, Auxa</text>
  </g>
  ${seal ? `${guilloche(seal, W / 2, 880, 84, 122).map((d, i) => micro(`${tag}g${i}`, d, mt, 2.6, '#0a9fae', 2400, 500)).join('')}
  <defs><path id="${tag}r" d="M ${W / 2 - 92} 880 a 92 92 0 1 1 184 0 a 92 92 0 1 1 -184 0"/></defs>
  <text font-family="Inter, Helvetica, Arial, sans-serif" font-size="7.4" letter-spacing="1.2" fill="#047683"><textPath href="#${tag}r">${esc(`AUXA ACADEMY · ${code} · ${seal.slice(0, 24).toUpperCase()} · AUTHENTIC · `.repeat(2))}</textPath></text>
  ${[0, 1].map((k) => micro(`${tag}w${k}`, sealWave(seal, 60, W - 60, 43, k), mt, 2.8, '#0a9fae', W) + micro(`${tag}v${k}`, sealWave(seal, 60, W - 60, H - 42, k + 2), mt, 2.8, '#0a9fae', W)).join('')}
  ${qrSvg(verifyUrl(code ?? ''), 92, 948, 96)}
  <text x="206" y="989" font-family="Inter, Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="#141414">Scan to verify</text>
  <text x="206" y="1010" font-family="'Courier New', monospace" font-size="16" fill="#047683" letter-spacing="1">${esc(code ?? '')}</text>
  <text x="206" y="1030" font-family="Inter, Helvetica, Arial, sans-serif" font-size="12" fill="#77776f">The lit keys play this certificate's melody</text>` : ''}
  <text x="${seal ? 206 : 92}" y="${seal ? 966 : 1030}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="2" fill="#141414">LV-${level}</text>
  <g transform="translate(${W / 2} 880)">
    <circle r="78" fill="#1ee3dc"/><circle r="66" fill="none" stroke="#141414" stroke-width="2" stroke-dasharray="4 6"/>
    <text y="-12" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#141414" letter-spacing="3">LEVEL</text>
    <text y="40" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="58" font-weight="800" fill="#141414">${level}</text>
  </g>
  ${keys}
</svg>`;
}


/** What finishing each level shows the learner can do (the certificate's citation). */
export const CERT_SKILLS: Record<number, string> = {
  0: 'good posture and hand shape, finding middle C, the notes C to G, the black keys and a steady beat',
  1: 'reading the treble and bass staves, counting rhythms aloud, and playing first melodies and chords',
  2: 'independent fingers, thumb-under and cross-over scale technique, staccato and left-hand accompaniment',
  3: 'reading the grand staff and playing hands together, from a melody over a bass to four voices',
  4: 'steady rhythm in eighths, dotted notes, rests, syncopation, sixteenths and triplets, in every common time signature',
  5: 'the keys of C, G, F and D major and A minor, key signatures and the chromatic scale',
  6: 'primary chords, inversions, minor chords and accompaniment patterns',
  7: 'expressive dynamics, legato and staccato touch, pedaling and phrasing',
  8: 'intervals, ledger lines and sight-reading new music',
  9: 'two-octave scales and arpeggios, seventh chords, octaves, pedal technique and ornaments',
  10: 'working out the key, melody and chords of a song by ear and playing it in any key',
  11: 'jazz harmony, swing, the ii–V–I, rootless voicings, the blues, improvisation and playing from a lead sheet',
  12: 'four-part writing, voice leading, cadences, harmonizing a melody and arranging for choir',
  13: 'leading congregational singing: hymns in two, three and four parts, chord symbols, keyboard and organ',
  14: 'pop, blues, ragtime, Latin, gospel, highlife and Afrobeat styles, and accompanying a singer',
};
/** The citation sentence for a level. */
export const certCitation = (level: number) => (CERT_SKILLS[level] ? `Demonstrating ${CERT_SKILLS[level]}.` : '');
function wrap(text: string, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(' ')) { if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); }
  if (line) out.push(line);
  return out;
}

/** The level's topics, each starting with a capital letter. */
export function certTopics(level: number) {
  return LESSONS.filter((l) => (l.track ?? 'piano') === 'piano' && l.level === level).slice(0, 5)
    .map((l) => cap((l.title.includes(':') ? l.title.split(':')[1].trim() : l.title).replace(/\s*\(.*\)$/, ''))).join('  ·  ');
}

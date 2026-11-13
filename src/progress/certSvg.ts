// The certificate artwork as an SVG string (also used for the PNG download).
import { LEVEL_NAMES } from '../curriculum/levels';
import { LESSONS } from '../curriculum/lessons';
import { AUXA_PATHS, WORD_BOX } from '../ui/brandPaths';
import { SIG_BOX, SIG_PATH } from './signature';
import QRCode from 'qrcode';
import { guilloche, sealMelody, sealWave, verifyUrl } from './certSeal';

export interface CertOpts {
  /** the name drawn as a path (so the font never changes when saved): path at baseline, font size 128 */
  nameShape?: { d: string; w: number };
  /** issued by the database: verification code and seal */
  code?: string;
  seal?: string;
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

const SCRIPT = "AuxaScript, 'Great Vibes', 'Brush Script MT', cursive";

/** scriptFont: optional data URL of the cursive font, embedded so the PNG export keeps it. */
export function certificateSvg(name: string, level: number, date: string, scriptFont?: string, opts: CertOpts = {}) {
  const { nameShape, code, seal } = opts;
  const topics = certTopics(level);
  const tune = seal ? sealMelody(seal) : [];
  const keys = Array.from({ length: 22 }, (_, i) => `<rect x="${560 + i * 22}" y="1010" width="20" height="56" rx="3" fill="${tune.includes(i) ? '#7fe9e4' : '#fff'}" stroke="#d9d6c8"/>`).join('')
    + tune.map((k, j) => `<g transform="translate(${570 + k * 22} ${996 - (tune.slice(0, j).filter((x) => x === k).length) * 15})"><circle r="7" fill="#047683"/><text y="3.5" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="9" font-weight="700" fill="#fff">${j + 1}</text></g>`).join('')
    + Array.from({ length: 22 }, (_, i) => ([1, 2, 4, 5, 6].includes(i % 7) && i < 21 ? `<rect x="${560 + i * 22 - 6}" y="1010" width="12" height="34" rx="2" fill="#1d1f1a"/>` : '')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${scriptFont ? `<style>@font-face{font-family:AuxaScript;src:url(${scriptFont}) format("woff2");}</style>` : ''}
  <rect width="${W}" height="${H}" fill="#fbf9f1"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="#141414" stroke-width="3"/>
  <rect x="50" y="50" width="${W - 100}" height="${H - 100}" fill="none" stroke="#0a9fae" stroke-width="2"/>
  <g transform="translate(${W / 2 - (WORD_BOX.w * 0.34) / 2} 104) scale(0.34) translate(${-WORD_BOX.x} ${-WORD_BOX.y})">
    <path fill="#161d26" fill-rule="evenodd" d="${AUXA_PATHS.dark_word}"/><path fill="#0aa5b4" fill-rule="evenodd" d="${AUXA_PATHS.word_cyan}"/>
  </g>
  <text x="${W / 2}" y="290" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" letter-spacing="10" fill="#047683">CERTIFICATE OF ACHIEVEMENT</text>
  <text x="${W / 2}" y="370" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="28" fill="#55554f">This certifies that</text>
  ${nameShape
    ? (() => { const sc = Math.min(1, 1080 / Math.max(1, nameShape.w)); return `<path transform="translate(${(W / 2 - (nameShape.w * sc) / 2).toFixed(1)} 490) scale(${sc.toFixed(4)})" fill="#141414" d="${nameShape.d}"/>`; })()
    : `<text x="${W / 2}" y="490" text-anchor="middle" font-family="${SCRIPT}" font-size="128" fill="#141414">${esc(name || 'An Auxa learner')}</text>`}
  <line x1="${W / 2 - 420}" y1="520" x2="${W / 2 + 420}" y2="520" stroke="#141414" stroke-width="1.5"/>
  <text x="${W / 2}" y="590" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="28" fill="#55554f">has mastered every lesson of</text>
  <text x="${W / 2}" y="670" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="54" font-weight="700" fill="#141414" letter-spacing="-1">Level ${level} · ${esc(LEVEL_NAMES[level] ?? '')}</text>
  <text x="${W / 2}" y="730" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" fill="#77776f">${esc(topics)}</text>
  <g transform="translate(240 820)">
    <line x1="0" y1="60" x2="340" y2="60" stroke="#141414" stroke-width="1.5"/>
    <text x="170" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-style="italic" fill="#141414">${esc(longDate(date))}</text>
    <text x="170" y="108" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" fill="#77776f">Date</text>
  </g>
  <g transform="translate(${W - 580} 820)">
    <line x1="0" y1="60" x2="340" y2="60" stroke="#141414" stroke-width="1.5"/>
    <path transform="translate(${170 - (SIG_BOX.w * 0.105) / 2} ${80 - SIG_BOX.h * 0.105}) scale(0.105)" fill="#141414" fill-rule="evenodd" d="${SIG_PATH}"/>
    <text x="170" y="108" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" fill="#77776f">Julius K · CEO, Auxa</text>
  </g>
  ${seal ? `<g fill="none" stroke="#0a9fae" stroke-width="0.9" opacity="0.75">${guilloche(seal, W / 2, 880, 84, 132).map((d) => `<path d="${d}"/>`).join('')}</g>
  <defs><path id="ring" d="M ${W / 2 - 92} 880 a 92 92 0 1 1 184 0 a 92 92 0 1 1 -184 0"/></defs>
  <text font-family="Inter, Helvetica, Arial, sans-serif" font-size="7.4" letter-spacing="1.2" fill="#047683"><textPath href="#ring">${esc(`AUXA ACADEMY · ${code} · ${seal.slice(0, 24).toUpperCase()} · AUTHENTIC · `.repeat(2))}</textPath></text>
  <g fill="none" stroke="#0a9fae" stroke-width="0.8" opacity="0.8">${[0, 1].map((k) => `<path d="${sealWave(seal, 60, W - 60, 42 + k * 0.01, k)}"/><path d="${sealWave(seal, 60, W - 60, H - 42, k + 2)}"/>`).join('')}</g>
  ${qrSvg(verifyUrl(code ?? ''), 92, 948, 96)}
  <text x="206" y="982" font-family="Inter, Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="#141414">Scan to verify</text>
  <text x="206" y="1004" font-family="'Courier New', monospace" font-size="16" fill="#047683" letter-spacing="1">${esc(code ?? '')}</text>
  <text x="206" y="1026" font-family="Inter, Helvetica, Arial, sans-serif" font-size="12" fill="#77776f">The lit keys play this certificate's melody</text>` : ''}
  <g transform="translate(${W / 2} 880)">
    <circle r="78" fill="#1ee3dc"/><circle r="66" fill="none" stroke="#141414" stroke-width="2" stroke-dasharray="4 6"/>
    <text y="-12" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#141414" letter-spacing="3">LEVEL</text>
    <text y="40" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="58" font-weight="800" fill="#141414">${level}</text>
  </g>
  ${keys}
</svg>`;
}


/** The level's topics, each starting with a capital letter. */
export function certTopics(level: number) {
  return LESSONS.filter((l) => (l.track ?? 'piano') === 'piano' && l.level === level).slice(0, 5)
    .map((l) => cap((l.title.includes(':') ? l.title.split(':')[1].trim() : l.title).replace(/\s*\(.*\)$/, ''))).join('  ·  ');
}

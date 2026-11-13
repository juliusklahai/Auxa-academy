// The certificate artwork as an SVG string (also used for the PNG download).
import { LEVEL_NAMES } from '../curriculum/levels';
import { LESSONS } from '../curriculum/lessons';
import { AUXA_PATHS } from '../ui/brandPaths';

export const W = 1600, H = 1130;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export function certificateSvg(name: string, level: number, date: string) {
  const lessons = LESSONS.filter((l) => (l.track ?? 'piano') === 'piano' && l.level === level);
  const topics = lessons.slice(0, 5).map((l) => (l.title.includes(':') ? l.title.split(':')[1].trim() : l.title).replace(/\s*\(.*\)$/, '')).join('  ·  ');
  const keys = Array.from({ length: 22 }, (_, i) => `<rect x="${560 + i * 22}" y="1010" width="20" height="56" rx="3" fill="#fff" stroke="#d9d6c8"/>`).join('')
    + Array.from({ length: 22 }, (_, i) => ([1, 2, 4, 5, 6].includes(i % 7) && i < 21 ? `<rect x="${560 + i * 22 - 6}" y="1010" width="12" height="34" rx="2" fill="#1d1f1a"/>` : '')).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fbf9f1"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="#141414" stroke-width="3"/>
  <rect x="50" y="50" width="${W - 100}" height="${H - 100}" fill="none" stroke="#9cb400" stroke-width="2"/>
  <g transform="translate(${W / 2 - 118} 92) scale(0.16)">
    <defs><linearGradient id="cl" x1="700" y1="520" x2="900" y2="760" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#034f63"/><stop offset=".45" stop-color="#0494c9"/><stop offset="1" stop-color="#00e5f5"/></linearGradient><linearGradient id="cs" x1="330" y1="700" x2="860" y2="470" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1fe6c8"/><stop offset="1" stop-color="#0ff4f7"/></linearGradient></defs>
    <g transform="translate(-318 -226)"><path fill="#161d26" fill-rule="evenodd" d="${AUXA_PATHS.dark_icon}"/><path fill="url(#cl)" fill-rule="evenodd" d="${AUXA_PATHS.leg}"/><path fill="url(#cs)" fill-rule="evenodd" d="${AUXA_PATHS.swoosh}"/></g>
    <g transform="translate(560 -620) scale(0.95)"><path fill="#161d26" fill-rule="evenodd" d="${AUXA_PATHS.dark_word}"/><path fill="url(#cs)" fill-rule="evenodd" d="${AUXA_PATHS.word_cyan}"/></g>
  </g>
  <text x="${W / 2}" y="290" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" letter-spacing="10" fill="#556b00">CERTIFICATE OF ACHIEVEMENT</text>
  <text x="${W / 2}" y="370" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="28" fill="#55554f">This certifies that</text>
  <text x="${W / 2}" y="490" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="96" font-style="italic" fill="#141414">${esc(name || 'A Auxa learner')}</text>
  <line x1="${W / 2 - 420}" y1="520" x2="${W / 2 + 420}" y2="520" stroke="#141414" stroke-width="1.5"/>
  <text x="${W / 2}" y="590" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="28" fill="#55554f">has mastered every lesson of</text>
  <text x="${W / 2}" y="670" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="54" font-weight="700" fill="#141414" letter-spacing="-1">Level ${level} · ${esc(LEVEL_NAMES[level] ?? '')}</text>
  <text x="${W / 2}" y="730" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" fill="#77776f">${esc(topics)}</text>
  <g transform="translate(240 820)">
    <line x1="0" y1="60" x2="340" y2="60" stroke="#141414" stroke-width="1.5"/>
    <text x="170" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-style="italic" fill="#141414">${esc(longDate(date))}</text>
    <text x="170" y="96" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" fill="#77776f">Date</text>
  </g>
  <g transform="translate(${W - 580} 820)">
    <line x1="0" y1="60" x2="340" y2="60" stroke="#141414" stroke-width="1.5"/>
    <text x="170" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="34" font-style="italic" fill="#141414">Auxa Coach</text>
    <text x="170" y="96" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" fill="#77776f">${lessons.length} lessons mastered</text>
  </g>
  <g transform="translate(${W / 2} 880)">
    <circle r="78" fill="#e3f53a"/><circle r="66" fill="none" stroke="#141414" stroke-width="2" stroke-dasharray="4 6"/>
    <text y="-12" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#141414" letter-spacing="3">LEVEL</text>
    <text y="40" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="58" font-weight="800" fill="#141414">${level}</text>
  </g>
  ${keys}
</svg>`;
}


// Social preview cards (1200x630) for shared links. Rebuild with `npm run build:og` (needs rsvg-convert):
//   public/og-certificate.png  certificate links (…/verify/?CODE)
//   public/og-image.png        the app itself
import { AUXA_PATHS, WORD_BOX, MARK_BOX } from '../src/ui/brandPaths';
import { guilloche } from '../src/progress/certSeal';

const W = 1200, H = 630;
const cert = process.argv[2] !== 'home';
const seal = 'a7c3e19f05b2d8467e1a9c3f5b0d2e4a6c8e0f1a3b5c7d9e1f2a4b6c8d0e2f4a';
const wb = WORD_BOX, mb = MARK_BOX;
const wordH = 70, wordW = wordH * (wb.w / wb.h);
const markH = 70, markW = markH * (mb.w / mb.h);

// certificate card on the right
const cx = 860, cy = 300, cw = 520, ch = 368;
const rings = guilloche(seal, 0, 0, 44, 64).map((d) => `<path d="${d}" fill="none" stroke="#0a9fae" stroke-width="0.7" opacity="0.75"/>`).join('');
const keys = Array.from({ length: 15 }, (_, i) => `<rect x="${-165 + i * 22}" y="128" width="20" height="40" rx="3" fill="${[2, 4, 6, 9].includes(i) ? '#7fe9e4' : '#fff'}" stroke="#d9d6c8"/>`).join('')
  + Array.from({ length: 15 }, (_, i) => ([1, 2, 4, 5, 6].includes(i % 7) && i < 14 ? `<rect x="${-165 + i * 22 - 6}" y="128" width="12" height="25" rx="2" fill="#1d1f1a"/>` : '')).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <radialGradient id="glow" cx="72%" cy="45%" r="60%"><stop offset="0" stop-color="#14f0e4" stop-opacity="0.22"/><stop offset="1" stop-color="#14f0e4" stop-opacity="0"/></radialGradient>
  <linearGradient id="w" x1="255" y1="1020" x2="365" y2="955" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22d9b8"/><stop offset="1" stop-color="#14f0e4"/></linearGradient>
  <linearGradient id="l" x1="700" y1="520" x2="900" y2="760" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#034f63"/><stop offset=".45" stop-color="#0494c9"/><stop offset="1" stop-color="#00e5f5"/></linearGradient>
  <linearGradient id="s" x1="330" y1="700" x2="860" y2="470" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1fe6c8"/><stop offset=".6" stop-color="#16f3e2"/><stop offset="1" stop-color="#0ff4f7"/></linearGradient>
  <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.55"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="#14161c"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>

<g transform="translate(70 70)">
  <svg width="${markW}" height="${markH}" viewBox="${mb.x} ${mb.y} ${mb.w} ${mb.h}"><path fill="#ffffff" fill-rule="evenodd" d="${AUXA_PATHS.dark_icon}"/><path fill="url(#l)" fill-rule="evenodd" d="${AUXA_PATHS.leg}"/><path fill="url(#s)" fill-rule="evenodd" d="${AUXA_PATHS.swoosh}"/></svg>
  <svg x="${markW + 14}" y="6" width="${wordW * 0.82}" height="${wordH * 0.82}" viewBox="${wb.x} ${wb.y} ${wb.w} ${wb.h}"><path fill="#ffffff" fill-rule="evenodd" d="${AUXA_PATHS.dark_word}"/><path fill="url(#w)" fill-rule="evenodd" d="${AUXA_PATHS.word_cyan}"/></svg>
</g>

<g font-family="Inter, 'DejaVu Sans', Arial, sans-serif">
  ${cert ? `<rect x="70" y="214" width="262" height="40" rx="20" fill="#14f0e4" fill-opacity="0.12" stroke="#14f0e4" stroke-opacity="0.5"/>
  <circle cx="94" cy="234" r="11" fill="#14f0e4"/><path d="M88.5 234.5 l4 4 l7-8" fill="none" stroke="#0b2a33" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="114" y="240" font-size="17" font-weight="600" fill="#bff9f4" letter-spacing="0.5">Verified by Auxa</text>
  <text x="70" y="330" font-size="58" font-weight="700" fill="#ffffff">Piano certificate</text>
  <text x="70" y="398" font-size="58" font-weight="700" fill="#14f0e4">earned on Auxa</text>
  <text x="70" y="462" font-size="25" fill="#aab2bf">Learn piano with a teacher that listens.</text>`
  : `<text x="70" y="290" font-size="48" font-weight="700" fill="#ffffff">Learn piano with</text>
  <text x="70" y="358" font-size="48" font-weight="700" fill="#14f0e4">a teacher that listens</text>
  <text x="70" y="424" font-size="25" fill="#aab2bf">Piano, theory and sight-reading.</text>
  <text x="70" y="460" font-size="25" fill="#aab2bf">Auxa hears every note you play.</text>`}
  <text x="70" y="560" font-size="19" fill="#6f7886">juliusklahai.github.io/Auxa-academy</text>
</g>

<g transform="translate(${cx} ${cy}) rotate(-4)" filter="url(#sh)">
  <rect x="${-cw / 2}" y="${-ch / 2}" width="${cw}" height="${ch}" rx="14" fill="#fbf9f1"/>
  <rect x="${-cw / 2 + 12}" y="${-ch / 2 + 12}" width="${cw - 24}" height="${ch - 24}" rx="6" fill="none" stroke="#047683" stroke-opacity="0.5" stroke-dasharray="2 2"/>
  <svg x="-62" y="-158" width="124" height="${124 * wb.h / wb.w}" viewBox="${wb.x} ${wb.y} ${wb.w} ${wb.h}"><path fill="#0b1b2b" fill-rule="evenodd" d="${AUXA_PATHS.dark_word}"/><path fill="url(#w)" fill-rule="evenodd" d="${AUXA_PATHS.word_cyan}"/></svg>
  <text y="-94" text-anchor="middle" font-family="Georgia, 'DejaVu Serif', serif" font-size="13" letter-spacing="4" fill="#047683">CERTIFICATE OF ACHIEVEMENT</text>
  <path d="M-150 -40 H150" stroke="#9aa39b" stroke-width="1"/>
  <path d="M-120 -54 c20 -30 40 -30 50 0 s30 -20 50 -6 s40 10 60 -8 s40 -6 80 4" fill="none" stroke="#141414" stroke-width="2.4" stroke-linecap="round" opacity="0.8"/>
  <text y="-18" text-anchor="middle" font-family="Inter, 'DejaVu Sans', Arial, sans-serif" font-size="12" fill="#555">has successfully completed a level</text>
  <g transform="translate(0 54)">${rings}<circle r="30" fill="#14f0e4" fill-opacity="0.9"/><circle r="26" fill="none" stroke="#047683" stroke-dasharray="2 2"/>
    <path d="M-12 1 l8 8 l16 -18" fill="none" stroke="#0b2a33" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>
  <g transform="translate(0 0)">${keys}</g>
</g>
</svg>`;
process.stdout.write(svg);

// App-styled tooltips instead of the browser's plain ones. Any element with a title shows a small
// rounded bubble on hover (mouse only; on touch, labels are visible already).
let tip: HTMLDivElement | null = null;
let timer = 0;
let current: HTMLElement | null = null;

function hide() { window.clearTimeout(timer); current = null; tip?.classList.remove('show'); }
function show(el: HTMLElement) {
  const text = el.dataset.tip;
  if (!text) return;
  if (!tip) { tip = document.createElement('div'); tip.className = 'mtip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  tip.textContent = text;
  tip.classList.remove('show', 'below');
  const r = el.getBoundingClientRect();
  tip.style.left = '0px'; tip.style.top = '0px';
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let top = r.top - h - 8, below = false;
  if (top < 8) { top = r.bottom + 8; below = true; }
  tip.style.left = `${Math.round(Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)))}px`;
  tip.style.top = `${Math.round(top)}px`;
  tip.classList.toggle('below', below);
  requestAnimationFrame(() => tip?.classList.add('show'));
}

export function installTooltips() {
  if (typeof window === 'undefined' || !window.matchMedia?.('(hover: hover)').matches) return;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement).closest?.<HTMLElement>('[title], [data-tip]');
    if (!el || el === current) return;
    const t = el.getAttribute('title');
    if (t) { el.dataset.tip = t; el.removeAttribute('title'); if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', t); }
    hide(); current = el;
    timer = window.setTimeout(() => show(el), 380);
  }, true);
  document.addEventListener('pointerout', (e) => { if (current && !current.contains(e.relatedTarget as Node)) hide(); }, true);
  document.addEventListener('pointerdown', hide, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
}

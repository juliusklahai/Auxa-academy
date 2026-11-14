import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/* Phone tab bar with a liquid notch: the bar's top edge dips into a smooth U under the active tab, the
   active icon rises into a cyan disc sitting in the dip, and the dip glides to the next tab when you tap. */
export type NotchItem = { id: string; icon: string; label: string };

const R = 33;   // half-width of the dip
const S = 13;   // shoulder that rounds the dip into the flat edge
const D = 35;   // depth of the dip
const C = 24;   // corner radius of the bar (shrinks when the dip reaches a corner)
const INSET = 16; // tabs sit a little in from the screen edges so the end tabs keep a full dip
const DISC = 48;

function barPath(w: number, h: number, cx: number) {
  const a = cx;
  const cl = Math.max(0, Math.min(C, a - R - S)), cr = Math.max(0, Math.min(C, w - (a + R + S)));
  return [
    `M0 ${cl}`, `Q0 0 ${cl} 0`,
    `L${a - R - S} 0`,
    `C${a - R + 1} 0 ${a - R * 0.7} ${D} ${a} ${D}`,
    `C${a + R * 0.7} ${D} ${a + R - 1} 0 ${a + R + S} 0`,
    `L${w - cr} 0`, `Q${w} 0 ${w} ${cr}`, `V${h}`, `H0`, 'Z',
  ].join(' ');
}

// ease-out with a little overshoot, so the dip lands like liquid settling
const ease = (t: number) => { const c = 1.15, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

export function NotchBar({ items, active, onPick }: { items: NotchItem[]; active: string | null; onPick: (id: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState(72);
  // side padding = our inset + the phone's safe area (notch, or the system buttons in landscape)
  const [pad, setPad] = useState<[number, number]>([INSET, INSET]);
  const idx = Math.max(0, items.findIndex((i) => i.id === active));
  const target = w ? pad[0] + ((w - pad[0] - pad[1]) / items.length) * (idx + 0.5) : 0;
  const [x, setX] = useState(target);
  const xr = useRef(target);
  const [pop, setPop] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      setW(el.clientWidth); setH(el.clientHeight);
      setPad([parseFloat(cs.paddingLeft) || INSET, parseFloat(cs.paddingRight) || INSET]);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el); measure();
    // rotating the phone or the app updating the safe areas changes the padding without a resize
    window.addEventListener('orientationchange', measure);
    const t = window.setInterval(measure, 1500);
    return () => { ro.disconnect(); window.removeEventListener('orientationchange', measure); window.clearInterval(t); };
  }, []);

  // glide the dip to the new tab
  useEffect(() => {
    if (!w) return;
    const from = xr.current || target, to = target;
    if (Math.abs(from - to) < 0.5 || matchMedia('(prefers-reduced-motion: reduce)').matches) { xr.current = to; setX(to); return; }
    setPop((p) => p + 1);
    const t0 = performance.now(), dur = 420;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const v = from + (to - from) * ease(k);
      xr.current = v; setX(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, w]); // eslint-disable-line

  const cur = items[idx];
  return (
    <nav className="notchbar" ref={ref} aria-label="Sections" style={{ paddingLeft: `calc(${INSET}px + var(--sal, 0px))`, paddingRight: `calc(${INSET}px + var(--sar, 0px))` }}>
      {w > 0 && (
        <svg className="nb-shape" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
          <path d={barPath(w, h, x)} />
        </svg>
      )}
      {active && cur && (
        <span key={pop} className="nb-disc" style={{ transform: `translateX(${x - DISC / 2}px)` }} aria-hidden>
          <span className="nb-disc-in"><Icon name={cur.icon} size={22} /></span>
        </span>
      )}
      {items.map((t, i) => (
        <button key={t.id} className={i === idx && active ? 'on' : ''} aria-current={i === idx && !!active} aria-label={t.label} onClick={() => onPick(t.id)}>
          <span className="nb-ic"><Icon name={t.icon} size={21} /></span>
          <span className="nb-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

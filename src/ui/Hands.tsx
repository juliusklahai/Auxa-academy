// Realistic line-art hands drawn over the keyboard (original vector drawing, generated from
// hand proportions). One continuous silhouette per hand (fill 20% transparent, dark outline),
// with fingernails, joint creases and knuckles. Fingers reach for their keys, the playing finger
// curls down into the key, and the whole hand glides when it has to change position.

import type { Hand, ScoreEvent } from '../core/types';
import type { PianoGeom } from './Piano';

const WHITE_OFF = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];
/** Absolute white-key index (black keys sit at .5 between their neighbors). */
export const absWhite = (m: number) => Math.floor(m / 12) * 7 + WHITE_OFF[((m % 12) + 12) % 12];

export interface HandState { base: number; active: { finger: number; midi: number }[] }
export type HandsAt = Partial<Record<Hand, HandState>>;

const handOf = (ev: ScoreEvent, p: number): Hand => ev.hand ?? ev.hands?.[ev.pitches.indexOf(p)] ?? (p < 60 ? 'LH' : 'RH');
const slotOf = (hand: Hand, base: number, finger: number) => (hand === 'RH' ? base + finger - 1 : base + 5 - finger);

/** Finger and hand position for every event (positions carry over between events). */
export function computeHandStates(events: ScoreEvent[]): HandsAt[] {
  const last: HandsAt = {};
  return events.map((ev) => {
    const now: HandsAt = {};
    (['RH', 'LH'] as Hand[]).forEach((h) => { if (last[h]) now[h] = { base: last[h]!.base, active: [] }; });
    const byHand = new Map<Hand, { p: number; f?: number }[]>();
    ev.pitches.forEach((p, i) => {
      const h = handOf(ev, p);
      byHand.set(h, [...(byHand.get(h) ?? []), { p, f: ev.fingers?.[i] }]);
    });
    byHand.forEach((notes, hand) => {
      let base = last[hand]?.base;
      const anchor = notes.find((n) => n.f);
      if (anchor) {
        const w = Math.floor(absWhite(anchor.p));
        base = hand === 'RH' ? w - (anchor.f! - 1) : w - (5 - anchor.f!);
      } else {
        const ws = notes.map((n) => Math.floor(absWhite(n.p)));
        const lo = Math.min(...ws), hi = Math.max(...ws);
        if (base === undefined || lo < base || hi > base + 4) base = base === undefined || lo < base ? lo : hi - 4;
      }
      const active = notes.map((n) => {
        if (n.f) return { finger: n.f, midi: n.p };
        const k = Math.floor(absWhite(n.p)) - base!;
        return { finger: hand === 'RH' ? k + 1 : 5 - k, midi: n.p };
      }).filter((a) => a.finger >= 1 && a.finger <= 5);
      now[hand] = { base: base!, active };
      last[hand] = now[hand];
    });
    return now;
  });
}

/** Space under the keys where palms and wrists are drawn. */
export const PALM_SPACE = 110;

type P = [number, number];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const f2 = (p: P) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

interface FingerGeo { f: number; base: P; tip: P; wb: number; wt: number; active: boolean; midi?: number }

/** Geometry of one finger edge-to-edge; returns outline pieces and details. */
function fingerParts(g: FingerGeo, sweep: 0 | 1) {
  const d: P = [g.tip[0] - g.base[0], g.tip[1] - g.base[1]];
  const len = Math.hypot(d[0], d[1]) || 1;
  const u: P = [d[0] / len, d[1] / len];
  // screen-left of the finger direction; mirrored hands swap sides via `sweep`
  const L: P = sweep ? [u[1], -u[0]] : [-u[1], u[0]];
  const bl = add(g.base, mul(L, g.wb / 2));
  const br = add(g.base, mul(L, -g.wb / 2));
  const tc = add(g.tip, mul(u, -g.wt / 2));
  const tl = add(tc, mul(L, g.wt / 2));
  const tr = add(tc, mul(L, -g.wt / 2));
  const bulge = (t: number, side: number, w: number) => add(add(g.base, mul(u, len * t)), mul(L, side * w));
  const left = `L${f2(bl)} C${f2(bulge(0.38, 1, g.wb * 0.55))} ${f2(bulge(0.72, 1, g.wt * 0.56))} ${f2(tl)} A${(g.wt / 2).toFixed(1)} ${(g.wt / 2).toFixed(1)} 0 0 ${sweep} ${f2(tr)} C${f2(bulge(0.72, -1, g.wt * 0.56))} ${f2(bulge(0.38, -1, g.wb * 0.55))} ${f2(br)}`;
  // nail
  const nl = g.wt * 0.72, nw = g.wt * 0.6;
  const nc = add(g.tip, mul(u, -g.wt * 0.62));
  const nbl = add(add(nc, mul(u, -nl * 0.5)), mul(L, nw * 0.5));
  const ntl = add(add(nc, mul(u, nl * 0.2)), mul(L, nw * 0.5));
  const ntr = add(add(nc, mul(u, nl * 0.2)), mul(L, -nw * 0.5));
  const nbr = add(add(nc, mul(u, -nl * 0.5)), mul(L, -nw * 0.5));
  const nail = `M${f2(nbl)} L${f2(ntl)} A${(nw / 2).toFixed(1)} ${(nw / 2).toFixed(1)} 0 0 ${sweep} ${f2(ntr)} L${f2(nbr)} Q${f2(add(nc, mul(u, -nl * 0.78)))} ${f2(nbl)}`;
  // joint creases (distal and middle joints) and a knuckle mark
  const crease = (t: number, w: number) => { const c = add(g.base, mul(u, len * t)); return `M${f2(add(c, mul(L, w * 0.28)))} Q${f2(add(c, mul(u, -len * 0.025)))} ${f2(add(c, mul(L, -w * 0.28)))}`; };
  const details = `${nail} ${crease(0.72, g.wt)} ${crease(0.4, g.wb * 0.95)} ${crease(0.42, g.wb * 0.7)}`;
  return { left, bl, br, details, tipCenter: add(g.tip, mul(u, -g.wt * 0.55)) };
}

function OneHand({ hand, state, g, showActive }: { hand: Hand; state: HandState; g: PianoGeom; showActive: boolean }) {
  const H = g.height, s = g.whiteW;
  const firstWhite = absWhite(g.whites[0]);
  const slotX = (slot: number) => (slot - firstWhite + 0.5) * s;
  const mir = hand === 'RH' ? 1 : -1;
  const cx = slotX(slotOf(hand, state.base, 3)); // middle finger column
  const rest = H * 0.66;     // fingertips rest on the white keys, in front of the black keys
  const kY = H * 1.2;        // knuckle line just below the keys
  // knuckle offsets (in key widths) and finger widths, right hand; left hand is mirrored
  const KX: Record<number, number> = { 1: -1.55, 2: -0.78, 3: 0, 4: 0.74, 5: 1.4 };
  const KY: Record<number, number> = { 1: 1.5, 2: 0.08, 3: 0, 4: 0.1, 5: 0.4 };
  const WB: Record<number, number> = { 1: 0.86, 2: 0.7, 3: 0.72, 4: 0.67, 5: 0.58 };
  const fingers: FingerGeo[] = [1, 2, 3, 4, 5].map((f) => {
    const act = showActive ? state.active.find((a) => a.finger === f) : undefined;
    const tx = act ? g.keyX(act.midi) : slotX(slotOf(hand, state.base, f)) + (f === 1 ? -mir * s * 0.08 : 0);
    let ty = f === 1 ? rest + H * 0.14 : rest;
    if (act) ty = (act.midi % 12 === 1 || act.midi % 12 === 3 || act.midi % 12 === 6 || act.midi % 12 === 8 || act.midi % 12 === 10) ? H * 0.4 : ty + H * 0.05;
    const base: P = [cx + mir * KX[f] * s, kY + KY[f] * s];
    let tip: P = [tx, ty];
    if (act) { // curl: the pressing finger bends down into the key, so it looks shorter from above
      const v: P = [base[0] - tip[0], base[1] - tip[1]];
      tip = add(tip, mul(v, 0.1));
    }
    return { f, base, tip, wb: WB[f] * s, wt: WB[f] * s * 0.82, active: !!act, midi: act?.midi };
  });
  // traverse in screen order: left wrist -> fingers left to right -> right wrist
  const order = hand === 'RH' ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
  const sweep: 0 | 1 = 1;
  const parts = order.map((f) => ({ f, ...fingerParts(fingers[f - 1], sweep) }));
  const bottom = H + PALM_SPACE + 30;
  const thumbSideX = cx + mir * -1.3 * s, pinkySideX = cx + mir * 1.55 * s;
  const wristL: P = [hand === 'RH' ? thumbSideX + s * 0.15 : pinkySideX - s * 0.05, bottom];
  const wristR: P = [hand === 'RH' ? pinkySideX - s * 0.05 : thumbSideX - s * 0.15, bottom];
  let d = `M${f2(wristL)}`;
  parts.forEach((p, i) => {
    if (i === 0) {
      const thenar = (hand === 'RH');
      const c1: P = [wristL[0] - (thenar ? s * 0.25 : s * 0.1), kY + H * 0.42];
      const c2: P = [p.bl[0] - (thenar ? s * 0.45 : s * 0.12), p.bl[1] + s * 0.9];
      d += ` C${f2(c1)} ${f2(c2)} ${f2(p.bl)}`;
    } else {
      const prev = parts[i - 1];
      const thumbWeb = prev.f === 1 || p.f === 1;
      const mid: P = [(prev.br[0] + p.bl[0]) / 2, (prev.br[1] + p.bl[1]) / 2];
      const ctrl: P = thumbWeb ? [hand === 'RH' ? p.bl[0] - s * 0.05 : prev.br[0] + s * 0.05, Math.max(prev.br[1], p.bl[1]) - s * 0.05] : [mid[0], mid[1] - s * 0.12];
      d += ` Q${f2(ctrl)} ${f2(p.bl)}`;
    }
    d += ' ' + p.left.replace(/^L[^C]+/, '');
  });
  const last = parts[parts.length - 1];
  const thenarR = hand === 'LH';
  d += ` C${f2([last.br[0] + (thenarR ? s * 0.45 : s * 0.12), last.br[1] + s * 0.9])} ${f2([wristR[0] + (thenarR ? s * 0.25 : s * 0.1), kY + H * 0.42])} ${f2(wristR)} Z`;
  const knuckles = [2, 3, 4, 5].map((f) => { const b = fingers[f - 1].base; return `M${f2([b[0] - s * 0.16, b[1] + s * 0.18])} Q${f2([b[0], b[1] + s * 0.06])} ${f2([b[0] + s * 0.16, b[1] + s * 0.18])}`; }).join(' ');
  return (
    <g className={`hand ${hand}`}>
      <path className="hand-skin" d={d} style={{ d: `path('${d}')` } as React.CSSProperties} />
      {(() => { const dl = parts.map((p) => p.details).join(' ') + ' ' + knuckles; return <path className="hand-lines" d={dl} style={{ d: `path('${dl}')` } as React.CSSProperties} />; })()}
      {fingers.map((fg) => {
        const p = parts.find((x) => x.f === fg.f)!;
        return (
          <g key={fg.f} className={`tipmark ${fg.active ? 'on' : ''}`}>
            {fg.active && <circle cx={p.tipCenter[0]} cy={p.tipCenter[1]} r={fg.wt * 0.42} />}
            <text x={p.tipCenter[0]} y={p.tipCenter[1] + fg.wt * 0.95 + 4} textAnchor="middle">{fg.f}</text>
          </g>
        );
      })}
      <text className="hand-label" x={cx + mir * 0.1 * s} y={H + PALM_SPACE - 12} textAnchor="middle">{hand === 'RH' ? 'RIGHT HAND' : 'LEFT HAND'}</text>
    </g>
  );
}

export function HandsOverlay({ g, states, index, showActive }: { g: PianoGeom; states: HandsAt[]; index: number; showActive: boolean }) {
  const used = new Set<Hand>();
  states.forEach((s) => (Object.keys(s) as Hand[]).forEach((h) => used.add(h)));
  const at = states[Math.max(0, Math.min(index, states.length - 1))] ?? {};
  const first = (h: Hand) => states.find((s) => s[h])?.[h];
  return (
    <svg className="hands" width={g.width} height={g.height + PALM_SPACE} aria-hidden>
      <defs>
        <linearGradient id="handfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.82" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <mask id="handmask"><rect x="0" y="0" width={g.width} height={g.height + PALM_SPACE} fill="url(#handfade)" /></mask>
      </defs>
      <g mask="url(#handmask)">
        {[...used].map((h) => {
          const st = at[h] ?? first(h);
          return st ? <OneHand key={h} hand={h} state={st} g={g} showActive={showActive && !!at[h]?.active.length} /> : null;
        })}
      </g>
    </svg>
  );
}

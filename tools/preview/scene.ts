// Visual test bench: a plain DOM keyboard with the 3D hands over it, driven by the real bridge/IK.
import { HandScene } from '../../src/hands3d/render';
import { AnimationBridge, WHITE_MM } from '../../src/hands3d/bridge';
import { HandPoser } from '../../src/hands3d/pose';
import { planFingering } from '../../src/hands3d/fingering';
import { isBlackKey } from '../../src/core/music';
import type { ScoreEvent } from '../../src/core/types';

const P = new URLSearchParams(location.search);
const lo = 48, hi = 84, W = +(P.get('w') || 1100), H = +(P.get('h') || 230);
const whites: number[] = []; for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
const ww = W / whites.length, k = ww / WHITE_MM;
const keyX = (m: number) => (isBlackKey(m) ? whites.indexOf(m - 1) + 1 : whites.indexOf(m) + 0.5) * ww;
const below = Math.round(Math.max(100, Math.min(260, 95 * k)));
const wrap = document.getElementById('kb')!;
wrap.style.width = W + 'px'; wrap.style.height = H + below + 'px';
const piano = document.createElement('div'); piano.className = 'piano'; piano.style.height = H + 'px'; wrap.appendChild(piano);
whites.forEach((m, i) => { const d = document.createElement('div'); d.className = 'w'; d.style.left = i * ww + 'px'; d.style.width = ww + 'px'; d.dataset.m = '' + m; piano.appendChild(d); });
for (let m = lo; m <= hi; m++) if (isBlackKey(m)) { const d = document.createElement('div'); d.className = 'b'; d.style.left = keyX(m) - ww * 0.3 + 'px'; d.style.width = ww * 0.6 + 'px'; d.dataset.m = '' + m; piano.appendChild(d); }
const canvas = document.createElement('canvas'); canvas.style.cssText = `position:absolute;z-index:3;left:0;top:0;width:${W}px;height:${H + below}px`; canvas.style.webkitMaskImage = canvas.style.maskImage = `linear-gradient(#000 ${H + below * 0.55}px, transparent ${H + below}px)`; wrap.appendChild(canvas);

const C = [0, 2, 4, 5, 7, 9, 11];
const piece = P.get('piece') || 'scale';
let events: ScoreEvent[] = [];
if (piece === 'scale') {
  const up = [...Array.from({ length: 14 }, (_, i) => 60 + Math.floor(i / 7) * 12 + C[i % 7]), 84];
  events = up.map((m, i) => ({ pitches: [m, m - 12], beat: i, beats: 1 }));
} else if (piece === 'chords') {
  events = [[60, 64, 67, 48], [65, 69, 72, 53], [67, 71, 74, 55], [61, 66, 70, 42]].map((p, i) => ({ pitches: p, beat: i * 2, beats: 2 }));
} else {
  events = [64, 63, 64, 63, 64, 59, 62, 60, 57].map((m, i) => ({ pitches: [m], beat: i * 0.5, beats: 0.5, hand: 'RH' as const }));
}
const fing = planFingering(events);
const bridge = new AnimationBridge(events, fing, (b) => b * 0.5, { x: (m) => keyX(m) / k, whiteLen: H / k, blackLen: (H * 0.62) / k });
const scene = new HandScene(canvas);
scene.resize(W, H + below, H, k);
scene.setStyle({ opacity: +(P.get('op') || 0.8), color: P.get('color') || 'white', stroke: 1, outline: true });
const posers = { RH: new HandPoser(), LH: new HandPoser() };
const T = +(P.get('t') || 1.2);
// settle IK by running the clock up to T
for (let t = Math.max(0, T - 1.5); t <= T + 1e-6; t += 1 / 60) {
  for (const h of ['RH', 'LH'] as const) {
    if (!bridge.present[h]) { scene.update(h, null); continue; }
    const a = bridge.at(h, t); const p = posers[h].pose(a);
    scene.update(h, p, a.yaw);
    scene.setHighlight(h, p.press, [0, 0, 0, 0, 0]);
    if (Math.abs(t - T) < 1 / 120) (window as any)['dbg_' + h] = { press: p.press, err: p.err.map((e) => +e.toFixed(1)), x: a.x };
  }
}
if (P.get('bind')) {
  const id = { frame: { pos: [250, 0, 30], rot: [0, 0, 0, 1] }, bones: Array.from({ length: 17 }, () => [0, 0, 0, 1]), tips: [], press: [0, 0, 0, 0, 0], err: [] } as any;
  scene.update('RH', id, 0); scene.update('LH', null);
}
const pressed = new Set<number>();
for (const h of ['RH', 'LH'] as const) bridge.notes[h].forEach((n) => { if (n.on <= T && T < n.off) pressed.add(n.midi); });
document.querySelectorAll<HTMLElement>('[data-m]').forEach((d) => { if (pressed.has(+d.dataset.m!)) d.classList.add('on'); });
if (P.get('dbg')) { const m = (scene as any).mats.RH.stroke; m.depthTest = false; m.color.set('#ff0000'); (scene as any).mats.RH.skin.visible = false; }
scene.render();
(window as any).done = true;
